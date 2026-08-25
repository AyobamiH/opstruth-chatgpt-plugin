# Security

Report security issues through the support contact published at the production `/support` route. Do not include credentials or secret values in reports.

The public MCP server is read-only. It accepts only public GitHub repository identifiers, restricts outbound repository requests to GitHub-owned hosts, bounds tree and file inspection, never returns matching secret values and never executes repository code.
