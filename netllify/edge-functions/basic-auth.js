// Netlify Edge Function - HTTP Basic Auth (username + password) for the whole site.
// Place this file at:  netlify/edge-functions/basic-auth.js  in your repo.
// Set the username/password as environment variables in Netlify (see steps below),
// so the credentials are NOT committed to GitHub.

export default async (request, context) => {
  const user = Netlify.env.get("BASIC_AUTH_USER");
  const pass = Netlify.env.get("BASIC_AUTH_PASS");

  // If the env vars are missing, fail closed (deny) rather than expose the site.
  const expected = user && pass ? "Basic " + btoa(`${user}:${pass}`) : null;
  const provided = request.headers.get("authorization");

  if (!expected || provided !== expected) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Akamai pricing", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }

  return context.next();
};

// Protect every path on the site.
export const config = { path: "/*" };
