/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      /**
       * Root → /login as a real HTTP redirect.
       *
       * This used to be a server-component `redirect()` in app/page.tsx.
       * Browsers coped (they follow the RSC payload), but Vercel served that
       * as a cached 307 with NO `Location` header, so anything that is not a
       * browser — crawlers, link checkers, Meta's pixel detector — got a
       * redirect pointing nowhere and never reached any HTML. That is why
       * "a pixel wasn't detected on this website" kept coming back for
       * app.leadkaun.com even though /login and /register both carry it.
       *
       * A `redirects()` entry is resolved before middleware and always emits
       * a proper Location header. Signed-in users still land correctly:
       * middleware bounces an authenticated visit to /login onward to the
       * dashboard, exactly as before.
       */
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
