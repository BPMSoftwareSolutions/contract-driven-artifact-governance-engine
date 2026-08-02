# Source Facts Semantic Refactor Console

A dependency-free, single-page interface concept for querying the `source-facts-semantic-search-engine` and reviewing executable mechanics that should move into semantic authority, ontology, or AST projection layers.

## Run

Open `index.html` directly in a browser, or serve the directory:

```bash
python -m http.server 8080 -d source-facts-query-console
```

## Intended engine bindings

Replace the embedded demonstration dataset with calls to the engine's query doorway. The UI expects a query result envelope containing rows, coverage disposition, index/query/plan/result digests, exact source references, and evidence classes.
