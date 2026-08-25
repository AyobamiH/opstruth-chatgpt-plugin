---
name: trace-application
description: Trace statically visible application routes, API surfaces, environment references and deployment entry points in a public GitHub repository. Use when the user asks how an application is wired, where requests enter, what routes exist, or what runtime claims can be supported by repository evidence.
---

# Trace Application

1. Call `opstruth_trace_routes` to discover file-system and declared routes.
2. Call `opstruth_review_api_contracts` for API handlers, OpenAPI files, GraphQL surfaces and contract artifacts.
3. Call `opstruth_audit_environment` for environment variable names and configuration surfaces without values.
4. Call `opstruth_check_deployment` when the trace must reach the visible deployment entry point.
5. Call `opstruth_probe_deployment` only for an explicitly supplied public HTTPS URL and relevant health paths. Do not invent or probe URLs inferred from source.
6. Label file-system, Express-style, router and OpenAPI relationships as static inference.
7. Never claim that a route responds, a socket is listening, an environment value exists or an application works merely because a health probe returned successfully.
