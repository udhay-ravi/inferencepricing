export default async (request, context) => {
  const auth = request.headers.get("Authorization");

  // This checks for your exact credentials 'demouser:inf123'
  if (auth !== "Basic ZGVtb3VzZXI6aW5mMTIz") {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Secure Site"',
      },
    });
  }

  return context.next();
};

export const config = { path: "/*" };
