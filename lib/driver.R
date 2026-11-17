# dsh-r-runner driver — a long-lived R process that speaks newline-delimited
# JSON over a loopback TCP socket.
#
# Why a socket and not stdin: `readLines(file("stdin"), 1)` blocks until EOF on a
# pipe, so a stdin-driven REPL cannot answer one command at a time. base R has
# `serverSocket()`/`socketAccept()` since 4.0, which gives a real request/response
# loop without adding a dependency (no httpuv, no plumber).
#
# Start:  R --slave -f driver.R --args <port> <plotDir>
# Reply:  one JSON object per line, always carrying the request's id.
#
# The only package used at runtime is jsonlite (bundled with R's recommended set).

local({
args <- commandArgs(trailingOnly = TRUE)
port <- if (length(args) >= 1L) as.integer(args[[1]]) else 0L
plot_dir <- if (length(args) >= 2L) args[[2]] else file.path(tempdir(), "dsh-r-plots")
dir.create(plot_dir, showWarnings = FALSE, recursive = TRUE)
# Keep srcref so "go to definition" can report file:line for source()d scripts.
options(keep.source = TRUE)

suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("dsh-r-runner: R package 'jsonlite' is required (install.packages('jsonlite'))")
  }
})

opts <- list(width = 960L, height = 640L, res = 110L, echo = FALSE)
plot_seq <- 0L
session_id <- paste0(format(Sys.time(), "%Y%m%d%H%M%S"), "-", Sys.getpid())

next_plot_path <- function() {
  plot_seq <<- plot_seq + 1L
  file.path(plot_dir, sprintf("plot-%s-%03d.png", session_id, plot_seq))
}

apply_graphics_options <- function() {
  options(device = function(...) {
    grDevices::png(filename = next_plot_path(), width = opts$width, height = opts$height,
                   res = opts$res, bg = "white")
  })
}
apply_graphics_options()

close_devices <- function() {
  closed <- 0L
  while (grDevices::dev.cur() > 1L) {
    try(grDevices::dev.off(), silent = TRUE)
    closed <- closed + 1L
    if (closed > 16L) break
  }
  closed
}

classify <- function(v) {
  cls <- paste(class(v), collapse = "/")
  dims <- dim(v)
  size <- if (!is.null(dims)) paste(dims, collapse = "x") else as.character(length(v))
  preview <- tryCatch({
    txt <- if (is.data.frame(v)) {
      paste0(nrow(v), " rows x ", ncol(v), " cols")
    } else if (is.matrix(v)) {
      paste0(dims[[1]], " x ", dims[[2]], " ", typeof(v))
    } else if (is.environment(v)) {
      "environment"
    } else if (is.function(v)) {
      paste(deparse(args(v))[[1]], collapse = " ")
    } else if (is.list(v)) {
      # models and other S3 objects are lists: their format() is a long dump
      paste0("list of ", length(v))
    } else if (length(v) == 0L) {
      paste0(typeof(v), "(0)")
    } else {
      shown <- if (is.character(v)) {
        utils::head(v, 4L) 
      } else {
        utils::head(as.character(format(v)), 4L)
      }
      shown <- if (is.character(v)) paste0('"', shown, '"') else shown
      more <- if (length(v) > 4L) " …" else ""
      paste0(paste(shown, collapse = " "), more)
    }
    substr(paste(txt, collapse = " "), 1L, 160L)
  }, error = function(e) "")
  list(name = "", class = cls, size = size, preview = preview)
}

variables <- function() {
  nms <- ls(envir = globalenv(), sorted = TRUE)
  if (length(nms) == 0L) return(list())
  lapply(nms, function(n) {
    v <- tryCatch(get(n, envir = globalenv()), error = function(e) NULL)
    item <- classify(v)
    item$name <- n
    item
  })
}

## A script that wants to know where it lives reads `commandArgs()` for `--file=`.
## We execute text over a socket, so those scripts give up and run in whatever
## directory happened to be current. Attach a shim — in its own environment, so the
## script's `rm(list = ls())` cannot delete it — that reports the file the text came
## from. RStudio's `rstudioapi` path stays untouched (it is not installed here).
with_file_args <- function(file, code) {
  if (is.null(file) || is.na(file) || !nzchar(file)) return(force(code))
  path <- try(normalizePath(file, mustWork = FALSE), silent = TRUE)
  if (inherits(path, "try-error") || !nzchar(path)) return(force(code))
  shim <- new.env(parent = baseenv())
  shim$commandArgs <- function(trailingOnly = FALSE) {
    args <- base::commandArgs(trailingOnly = FALSE)
    if (!any(grepl("^--file=", args))) args <- c(args, paste0("--file=", path))
    args
  }
  env_name <- "dsh_r_runner:file"
  suppressWarnings(attach(shim, name = env_name, warn.conflicts = FALSE))
  tryCatch(force(code), finally = try(detach(env_name), silent = TRUE))
}

run_code <- function(code, wd = NULL, echo = NULL, file = NULL) {
  if (!is.null(echo)) opts$echo <<- isTRUE(echo)
  started <- Sys.time()
  before <- list.files(plot_dir, full.names = TRUE, pattern = "\\.png$")
  old_wd <- getwd()
  if (!is.null(wd) && nzchar(wd) && dir.exists(wd)) setwd(wd)

  status <- "ok"
  errmsg <- NULL
  warnings <- character()

  # capture.output() is what makes the console useful: print()/cat() inside the
  # user's code go to the R stdout connection, which the host never reads. Only
  # lines captured here travel back over the socket.
  captured <- capture.output({
    withCallingHandlers(
      with_file_args(file, tryCatch({
        exprs <- parse(text = code)
        for (expr in exprs) {
          value <- withVisible(eval(expr, envir = globalenv()))
          if (isTRUE(value$visible)) print(value$value)
        }
        invisible(NULL)
      }, error = function(e) {
        status <<- "error"
        errmsg <<- conditionMessage(e)
        NULL
      })),
      warning = function(w) {
        warnings <<- c(warnings, paste0("Warning: ", conditionMessage(w)))
        invokeRestart("muffleWarning")
      },
      message = function(m) {
        warnings <<- c(warnings, conditionMessage(m))
        invokeRestart("muffleMessage")
      }
    )
    invisible(NULL)
  }, type = "output")

  # Flush any open graphics device so the PNG on disk is complete before the
  # panel asks for it.
  close_devices()
  try(setwd(old_wd), silent = TRUE)

  after <- list.files(plot_dir, full.names = TRUE, pattern = "\\.png$")
  plots <- setdiff(after, before)
  elapsed <- as.numeric(difftime(Sys.time(), started, units = "secs")) * 1000

  list(
    kind = "run",
    ok = identical(status, "ok"),
    status = status,
    stdout = paste(captured, collapse = "\n"),
    stderr = paste(warnings, collapse = "\n"),
    error = errmsg,
    ms = round(elapsed, 1),
    plots = unname(as.list(plots)),
    wd = getwd()
  )
}

# Help text for a topic: utils:::.getHelpFile() gives the Rd object, Rd2txt
# renders it to a file we can read back as plain text.
help_text <- function(topic) {
  topic <- trimws(as.character(topic %||% ""))
  if (!nzchar(topic)) return(list(ok = FALSE, error = "empty topic"))
  rd <- tryCatch(utils:::.getHelpFile(utils::help(topic, help_type = "text")),
                 error = function(e) NULL)
  if (is.null(rd)) return(list(ok = FALSE, topic = topic, error = paste0("no help found for '", topic, "'")))
  tmp <- tempfile(fileext = ".txt")
  on.exit(unlink(tmp), add = TRUE)
  rendered <- tryCatch({ tools::Rd2txt(rd, out = tmp); TRUE }, error = function(e) FALSE)
  if (!rendered) return(list(ok = FALSE, topic = topic, error = "could not render the help page"))
  text <- paste(readLines(tmp, warn = FALSE), collapse = "\n")
  # Rd2txt underlines/bolds by overstriking ("_\bA"); drop those pairs.
  text <- gsub(".\\x08", "", text, perl = TRUE)
  text <- gsub("\x08", "", text, useBytes = TRUE)
  list(ok = TRUE, topic = topic, text = text, lines = length(strsplit(text, "\n")[[1]]))
}

# A tabular preview of an object for the data viewer: column names plus the
# first `limit` rows, cells coerced to strings so JSON stays simple.
data_preview <- function(name, limit = 100L) {
  name <- as.character(name %||% "")
  if (!nzchar(name) || !exists(name, envir = globalenv())) {
    return(list(ok = FALSE, error = paste0("no object named '", name, "'")))
  }
  v <- get(name, envir = globalenv())
  as_text <- function(x) { x <- as.character(x); x[is.na(x)] <- "<NA>"; x }
  if (is.data.frame(v)) {
    shown <- utils::head(v, limit)
    cols <- names(shown)
    rows <- lapply(seq_len(nrow(shown)), function(i) {
      as.list(unname(vapply(cols, function(cn) as_text(shown[[cn]][i]), "")))
    })
    return(list(ok = TRUE, name = name, kind = paste(class(v), collapse = "/"),
                columns = as.list(cols), rows = rows, total = nrow(v), shown = nrow(shown)))
  }
  if (is.matrix(v)) {
    shown <- utils::head(v, limit)
    cols <- colnames(shown)
    if (is.null(cols)) cols <- paste0("V", seq_len(ncol(shown)))
    rows <- lapply(seq_len(nrow(shown)), function(i) as.list(unname(as_text(shown[i, ]))))
    return(list(ok = TRUE, name = name, kind = paste(class(v), collapse = "/"),
                columns = as.list(cols), rows = rows, total = nrow(v), shown = nrow(shown)))
  }
  if (is.atomic(v) && is.null(dim(v))) {
    shown <- utils::head(v, limit)
    rows <- lapply(unname(as_text(shown)), function(cell) list(cell))
    return(list(ok = TRUE, name = name, kind = paste(class(v), collapse = "/"),
                columns = list("value"), rows = rows, total = length(v), shown = length(shown)))
  }
  list(ok = FALSE, error = paste0("'", name, "' is not tabular (", paste(class(v), collapse = "/"), ")"))
}

# ---------------------------------------------------------------- code intel

R_KEYWORDS <- c(
  "if", "else", "repeat", "while", "for", "next", "break", "function", "return",
  "TRUE", "FALSE", "NULL", "NA", "NA_integer_", "NA_real_", "NA_character_", "Inf", "NaN",
  "library", "require", "source", "print", "cat", "message", "warning", "stop",
  "tryCatch", "try", "withCallingHandlers", "invisible", "suppressWarnings", "suppressMessages",
  "switch", "match.arg", "missing", "stopifnot", "on.exit", "Sys.time", "seq_along"
)

# Candidates for the token that ends `line`. Three shapes are supported:
#   pkg::name   -> exported objects of that package
#   obj$name    -> column names / list element names of that object
#   plain       -> global environment, search path, attached packages, keywords
complete_token <- function(line, limit = 300L) {
  line <- as.character(line %||% "")
  limit <- as.integer(limit %||% 300L)

  ns <- regmatches(line, regexpr("[A-Za-z][A-Za-z0-9._]*::$", line))
  if (length(ns) > 0L) {
    pkg <- sub("::$", "", ns)
    if (!pkg %in% loadedNamespaces()) {
      tryCatch(loadNamespace(pkg), error = function(e) NULL)
    }
    if (pkg %in% loadedNamespaces()) {
      items <- getNamespaceExports(pkg)
      return(list(ok = TRUE, mode = "namespace", package = pkg, prefix = "",
                  items = lapply(head(sort(items), limit), function(x)
                    list(label = x, kind = "export", package = pkg))))
    }
    return(list(ok = TRUE, mode = "namespace", package = pkg, prefix = "", items = list()))
  }

  dollar <- regmatches(line, regexpr("[A-Za-z][A-Za-z0-9._]*\\$[A-Za-z0-9._]*$", line))
  if (length(dollar) > 0L) {
    object <- sub("\\$.*$", "", dollar)
    prefix <- sub("^.*\\$", "", dollar)
    if (exists(object, envir = globalenv())) {
      target <- get(object, envir = globalenv())
      names_here <- tryCatch(names(target), error = function(e) NULL)
      if (is.null(names_here) && is.environment(target)) names_here <- ls(target)
      names_here <- names_here[startsWith(names_here, prefix)]
      return(list(ok = TRUE, mode = "dollar", object = object, prefix = prefix,
                  items = lapply(head(sort(names_here), limit), function(x)
                    list(label = x, kind = "field", package = ""))))
    }
    return(list(ok = TRUE, mode = "dollar", object = object, prefix = prefix, items = list()))
  }

  prefix <- regmatches(line, regexpr("[A-Za-z._][A-Za-z0-9._]*$", line))
  prefix <- if (length(prefix) > 0L) prefix else ""

  found <- list()
  seen <- character()
  add <- function(name, kind, package = "") {
    if (!nzchar(name) || name %in% seen) return(invisible(NULL))
    if (nzchar(prefix) && !startsWith(name, prefix)) return(invisible(NULL))
    seen <<- c(seen, name)
    is_fn <- kind == "function"
    found[[length(found) + 1L]] <<- list(label = name, kind = kind, package = package)
    invisible(NULL)
  }

  for (name in ls(envir = globalenv(), all.names = TRUE)) {
    kind <- "object"
    value <- tryCatch(get0(name, envir = globalenv(), inherits = FALSE), error = function(e) NULL)
    if (is.function(value)) kind <- "function"
    add(name, kind, "globalenv")
  }
  for (package in rev(.packages())) {
    exports <- tryCatch(getNamespaceExports(package), error = function(e) character())
    for (name in exports) add(name, "function", package)
  }
  for (name in R_KEYWORDS) add(name, "keyword")
  for (name in ls(envir = baseenv(), all.names = TRUE)) add(name, "function", "base")

  items <- found[seq_len(min(length(found), limit))]
  list(ok = TRUE, mode = "plain", prefix = prefix, items = items,
       total = length(found), truncated = length(found) > length(items))
}

# Parse the buffer and report syntax problems; a couple of cheap style lints
# ride along so the gutter is useful even while the code is valid.
diagnose_code <- function(code) {
  code <- as.character(code %||% "")
  problems <- list()
  parsed <- tryCatch(parse(text = code, keep.source = TRUE), error = function(e) e)
  if (inherits(parsed, "error")) {
    message_text <- conditionMessage(parsed)
    line <- NA_integer_
    column <- NA_integer_
    match <- regmatches(message_text, regexec("([0-9]+):([0-9]+):?\\s*", message_text))[[1]]
    if (length(match) >= 3L) {
      line <- as.integer(match[2]); column <- as.integer(match[3])
    } else {
      match <- regmatches(message_text, regexec("[^0-9]+([0-9]+):([0-9]+)$", message_text))[[1]]
      if (length(match) >= 3L) { line <- as.integer(match[2]); column <- as.integer(match[3]) }
    }
    problems[[length(problems) + 1L]] <- list(
      line = if (is.na(line)) 1L else line,
      column = if (is.na(column)) 1L else column,
      severity = "error", source = "parse", message = message_text)
  }
  lines <- strsplit(code, "\n", fixed = TRUE)[[1]]
  for (index in seq_along(lines)) {
    text <- lines[index]
    if (grepl("\\bsetwd\\s*\\(", text)) {
      problems[[length(problems) + 1L]] <- list(line = index, column = 1, severity = "warning",
        source = "lint", message = "setwd() changes the project directory; prefer the panel's working directory")
    }
    if (grepl("\\battach\\s*\\(", text)) {
      problems[[length(problems) + 1L]] <- list(line = index, column = 1, severity = "warning",
        source = "lint", message = "attach() makes name lookup unpredictable; use with() or $. notation")
    }
    if (grepl("(?<![=!<>])=(?!=)", text, perl = TRUE) && !grepl("<-|function|==|=>|<=|>=|\\$|\\[|list\\(|\\(=", text)) {
      problems[[length(problems) + 1L]] <- list(line = index, column = 1, severity = "info",
        source = "lint", message = "= used for assignment; <- is the conventional form")
    }
  }
  list(ok = TRUE, problems = problems, count = length(problems))
}

# Where does `name` come from? Functions defined in the editor carry a srcref,
# which points back at the file and the first line.
# "name(a, b = 2, ...)" built from formals(); a missing default deparses to "",
# which is how we tell `x` from `method = "qr"` (deparse(args()) would emit NULL).
signature_of <- function(name, value) {
  fml <- tryCatch(formals(value), error = function(e) NULL)
  if (is.null(fml)) return("")
  if (length(fml) == 0L) return(paste0(name, "()"))
  parts <- vapply(names(fml), function(key) {
    default <- tryCatch(paste(deparse(fml[[key]]), collapse = " "), error = function(e) "")
    if (!nzchar(default)) key else paste0(key, " = ", default)
  }, character(1), USE.NAMES = FALSE)
  paste0(name, "(", paste(parts, collapse = ", "), ")")
}

definition_of <- function(name) {
  name <- trimws(as.character(name %||% ""))
  if (!nzchar(name)) return(list(ok = FALSE, error = "empty name"))
  value <- NULL
  where <- ""
  if (exists(name, envir = globalenv(), inherits = FALSE)) {
    value <- get(name, envir = globalenv(), inherits = FALSE)
    where <- "globalenv"
  } else {
    hits <- tryCatch(utils::getAnywhere(name), error = function(e) NULL)
    if (!is.null(hits) && length(hits$objs) > 0L) {
      value <- hits$objs[[1]]
      where <- if (length(hits$where) > 0L) hits$where[1] else ""
    }
  }
  if (is.null(value)) {
    return(list(ok = FALSE, name = name, error = paste0("no definition found for '", name, "'")))
  }
  file <- NA_character_
  line <- NA_integer_
  # R keeps srcref on the object itself; getSrcFilename()/getSrcLocation()
  # resolve both plain srcrefs and functions from source()d files (the
  # "srcfile" attribute is empty on modern R, so don't read it by hand).
  file <- NA_character_
  line <- NA_integer_
  try({
    resolved <- utils::getSrcFilename(value, full.names = TRUE)
    if (length(resolved) > 0L && !is.na(resolved[1]) && nzchar(resolved[1])) file <- resolved[1]
    located <- utils::getSrcLocation(value, "line")
    if (length(located) > 0L && !is.na(located[1])) line <- as.integer(located[1])
  }, silent = TRUE)
  signature <- ""
  if (is.function(value)) {
    signature <- signature_of(name, value)
  }
  text <- paste(utils::head(deparse(value), 12L), collapse = "\n")
  list(ok = TRUE, name = name, where = where, file = file, line = line,
       kind = if (is.function(value)) "function" else "object",
       signature = signature, text = text)
}

# Loaded packages plus the installed library (cached: installed.packages() is slow).
package_inventory <- function(refresh = FALSE) {
  cache <- get0("pkg_cache", envir = globalenv(), inherits = FALSE)
  if (refresh || is.null(cache)) {
    installed <- tryCatch(utils::installed.packages()[, c("Package", "Version"), drop = FALSE],
                          error = function(e) NULL)
    rows <- list()
    if (!is.null(installed)) {
      for (index in seq_len(nrow(installed))) {
        rows[[index]] <- list(name = installed[index, "Package"],
                              version = installed[index, "Version"],
                              library = dirname(dirname(rownames(installed)[index])))
      }
    }
    cache <- list(rows = rows, at = format(Sys.time(), "%Y-%m-%d %H:%M:%S"))
    assign("pkg_cache", cache, envir = globalenv())
  }
  loaded <- lapply(rev(.packages()), function(package) {
    list(name = package,
         version = tryCatch(as.character(utils::packageVersion(package)), error = function(e) ""),
         path = tryCatch(dirname(getNamespaceInfo(package, "path")), error = function(e) ""))
  })
  list(ok = TRUE, loaded = loaded, installed = cache$rows,
       installedAt = cache$at, libPaths = unname(.libPaths()))
}

handle <- function(req) {
  kind <- req$kind
  id <- req$id
  out <- switch(kind,
    ping = list(ok = TRUE, r = R.version.string, pid = Sys.getpid()),
    run = {
      if (!is.null(req$options)) {
        if (!is.null(req$options$width)) opts$width <<- as.integer(req$options$width)
        if (!is.null(req$options$height)) opts$height <<- as.integer(req$options$height)
        if (!is.null(req$options$res)) opts$res <<- as.integer(req$options$res)
        apply_graphics_options()
      }
      # source() inside run_code would re-setwd; here a wd is the caller's
      # choice and run_code restores the previous directory afterwards.
      run_code(req$code %||% "", wd = req$wd, echo = req$echo, file = req$file)
    },
    vars = list(ok = TRUE, variables = variables(), wd = getwd()),
    assign = {
      status <- "ok"; errmsg <- NULL
      tryCatch({
        assign(req$name, eval(parse(text = req$value), envir = globalenv()), envir = globalenv())
      }, error = function(e) { status <<- "error"; errmsg <<- conditionMessage(e) })
      list(ok = identical(status, "ok"), status = status, error = errmsg)
    },
    rm = {
      tryCatch(rm(list = req$name, envir = globalenv()), error = function(e) NULL)
      list(ok = TRUE)
    },
    source_file = {
      path <- req$path
      wd <- if (isTRUE(req$chdir)) dirname(path) else NULL
      run_code(sprintf("source(%s, echo = %s)", deparse(path), if (isTRUE(req$echo)) "TRUE" else "FALSE"),
               wd = wd, echo = req$echo)
    },
    help = help_text(req$topic),
    complete = complete_token(req$line, req$limit),
    diagnose = diagnose_code(req$code),
    definition = definition_of(req$name),
    packages = package_inventory(isTRUE(req$refresh)),
    data = data_preview(req$name, if (is.null(req$limit)) 100L else as.integer(req$limit)),
    stop = list(ok = TRUE, stops = TRUE),
    list(ok = FALSE, error = paste0("unknown command: ", kind))
  )
  out$id <- id
  # keep the payload's own `kind` (run/data/help); the command name goes to `cmd`
  out$cmd <- kind
  out
}

`%||%` <- function(a, b) if (is.null(a)) b else a

serve <- function(con) {
  repeat {
    line <- tryCatch(readLines(con, n = 1L, warn = FALSE), error = function(e) character())
    if (length(line) == 0L) return(invisible(NULL))
    if (!nzchar(line)) next
    req <- tryCatch(jsonlite::fromJSON(line, simplifyVector = FALSE),
                    error = function(e) list(kind = "__bad__", id = NULL, raw = line))
    resp <- tryCatch(handle(req), error = function(e) {
      list(id = req$id, kind = req$kind, ok = FALSE, error = conditionMessage(e))
    })
    payload <- tryCatch(
      jsonlite::toJSON(resp, auto_unbox = TRUE, null = "null", na = "null", digits = NA),
      error = function(e) jsonlite::toJSON(list(id = req$id, ok = FALSE,
                                               error = paste("serialize failed:", conditionMessage(e))),
                                            auto_unbox = TRUE))
    writeLines(as.character(payload), con)
    flush(con)
    if (identical(req$kind, "quit")) return(invisible(NULL))
  }
}

srv <- serverSocket(port)
repeat {
  con <- tryCatch(socketAccept(srv, blocking = TRUE, open = "r+"), error = function(e) NULL)
  if (is.null(con)) break
  serve(con)
  try(close(con), silent = TRUE)
}
try(close(srv), silent = TRUE)

})
