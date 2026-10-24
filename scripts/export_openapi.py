import json
from pathlib import Path
from chokepoint.api.app import app
Path("docs/openapi.json").write_text(json.dumps(app.openapi(),indent=2,sort_keys=True)+"\n",encoding="utf-8")
