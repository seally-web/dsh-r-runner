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

run_code <- function(code, wd = NULL, echo = NULL) {
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
      tryCatch({
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
      }),
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
      run_code(req$code %||% "", wd = req$wd, echo = req$echo)
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
