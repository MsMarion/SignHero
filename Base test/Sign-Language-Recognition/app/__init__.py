# app/__init__.py

from .frame_utils import *

# `app.frame` is the old Tk desktop GUI. It is intentionally not imported here so that the API
# server (api_server_http.py) does not need tkinter. Import it explicitly if you want the GUI:
#   from app.frame import *
