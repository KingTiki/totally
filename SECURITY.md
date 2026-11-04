# Security

[Deutsch](SECURITY.de.md) · [README](README.md)

Please report vulnerabilities privately using **Security → Report a vulnerability**
on the GitHub repository when available. Include affected version, impact and
minimal reproduction steps using fictional data. Never attach live credentials,
contact exports or private logs.

If private reporting is unavailable, open an issue asking for a private reporting
channel without disclosing the vulnerability or exploit details.

Fixes target the latest published release; older versions have no separate
maintenance commitment. Follow release notes and update your installation.

For deployment precautions, see [deployment](docs/deployment.md) and
[backups](docs/backups.md): use HTTPS, protect the data folder and `.env`, and run
only one process per data directory. The app does not encrypt files at rest.
