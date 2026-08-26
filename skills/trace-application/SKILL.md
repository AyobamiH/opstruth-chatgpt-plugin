---
name: trace-application
description: Use this when a user asks how a public GitHub application is wired, where requests enter, which routes or API surfaces exist, or which runtime claims repository evidence can support. This is static tracing only and must not be used to claim reachability, authentication or application correctness.
---

# Trace Application

1. Call `opstruth_trace_routes` to discover file-system and declared routes.
2. Call `opstruth_review_api_contracts` for API handlers, OpenAPI files, GraphQL surfaces and contract artifacts.
3. Call `opstruth_audit_environment` for environment variable names and configuration surfaces without values.
4. Call `opstruth_check_deployment` when the trace must reach the visible deployment entry point.
5. Call `opstruth_probe_deployment` only for an explicitly supplied public HTTPS URL and relevant health paths. Do not invent or probe URLs inferred from source.
6. Label file-system, Express-style, router and OpenAPI relationships as static inference.
7. Never claim that a route responds, a socket is listening, an environment value exists or an application works merely because a health probe returned successfully.
