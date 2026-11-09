# Policy source

Policies are versioned atomically in the migrations. Authenticated clients have owner-scoped read access only in this milestone. There are deliberately no browser write grants, agent enrollment endpoints or executable remote commands. Service-role access must never reach the browser. Future agent writes require authenticated device enrollment and independent device authorization; owner IDs alone are insufficient.
