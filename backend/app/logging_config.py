import logging

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"

_configured = False


def setup_logging(level: str = "INFO") -> None:
    """
    Attach a handler to the root logger so app loggers are visible.

    uvicorn only configures its own "uvicorn.*" loggers, so without this the
    app's log records have nowhere to go and are silently dropped.
    """
    global _configured
    if _configured:
        return
    _configured = True

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))

    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # aiosqlite logs every statement at DEBUG, which drowns everything else.
    logging.getLogger("aiosqlite").setLevel(logging.INFO)
