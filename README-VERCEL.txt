NothingP AIOsubtitles Vercel build

Base:
- NothingP-AIOsubtitles_v3.9.66_DYNAMIC_10_INFLIGHT.txt
- Existing application logic is preserved.

Files:
- server.js   = original Render application converted only to the Vercel project entry file
- package.json = runtime/dependencies
- vercel.json = minimal Vercel configuration; Express/Node is detected automatically

Deploy:
1. Upload/push this folder to GitHub.
2. Import the repository into Vercel.
3. Set the same environment variables used by the Render deployment.
4. Deploy.
5. Open /healthz, then /configure.

Important:
- Do NOT put Gemini API keys into source code or GitHub. Use Vercel Environment Variables.
- The in-memory caches/maps in the existing application remain in-memory; this build does not replace them with an external database/cache.
- The existing background translation design is preserved as-is.
