# Divorce-Ledger-AI Python API Scaffold

This folder contains the foundation for the future Python-based backend that will execute core application logic.

**CRITICAL NOTE**: Do **NOT** bind the frontend to these endpoints yet. The React frontend continues to speak to the existing Express/TypeScript backend until feature parity is achieved and fully regression tested.

## Scaffold Structure

This foundation uses the exact layout and technology stack specified:
- **FastAPI**: Core HTTP protocol and router layer
- **Pydantic**: Data schema validation mapped to the UI types
- **SQLAlchemy 2.0 (Async)**: Database interactions securely connected to your `DATABASE_URL`
- **Alembic**: For future state migrations

### Directory Map
```
python_api/
├── alembic.ini             # Migration script base config
├── requirements.txt        # Isolated Python dependencies
├── main.py                 # Core booting entrypoint (Uvicorn)
└── app/
    ├── api/
    │   ├── router.py       # Global router aggregation
    │   └── endpoints/      # Domain specific controllers
    │       ├── auth.py
    │       ├── workspaces.py 
    │       ├── cases.py
    │       ├── ledger.py
    │       ├── documents.py
    │       ├── reports.py
    │       └── health.py
    ├── models/
    │   └── base.py         # SQLAlchemy Base Model setup
    ├── config.py           # Settings from os.environ
    ├── database.py         # Asyncpg session pools
    ├── dependencies.py     # Auth/Tenant context helpers
    └── logging.py          # Unified log output
```

## How It Coexists Safely
1. **Isolated Root Directory**: The `python_api/` folder lives parallel to the node `server/` layer. Vite and Express completely ignore it. You can deploy or build the standard UI without triggering any Python changes.
2. **Distinct Port Boundary**: When ran locally, `python_api/main.py` binds to port `8000`, while the Node/React layer defaults to `5000`. They will never collide.
3. **Database Passive Observation**: The async session inside `app/database.py` binds natively to the existing Postgres `DATABASE_URL`. It does not execute DDL creations. It is strictly passive until explicitly ordered via Alembic migrations.

## Local Execution Commands

To spin up this backend alongside your existing system for testing or active development:

1. **Activate Environment** (Recommended):
```bash
cd python_api
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate
```

2. **Install Dependencies**:
```bash
pip install -r requirements.txt
```

3. **Start the Development Server**:
```bash
# Uvicorn will boot FastAPI on port 8000
python main.py
```
*(Optionally you can run `uvicorn main:app --reload` from within the root if preferring the CLI tool natively)*

Verify it is running natively independently of Node by hitting:
`http://localhost:8000/api/health/python`
