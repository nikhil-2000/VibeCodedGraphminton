"""Export the FastAPI OpenAPI schema to openapi.json at the repo root."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.main import app  # noqa: E402

output = Path(__file__).parent.parent / "openapi.json"
output.write_text(json.dumps(app.openapi(), indent=2))
print(f"Written to {output}")
