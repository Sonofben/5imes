import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

const PROTECTED = ["/app", "/admin", "/console", "/start", "/onboarding", "/pending"];

export async function proxy(request: NextRequest) {
  // A fresh nonce per request. Next.js reads the policy from the request headers and adds
  // the nonce to its own scripts; the same policy is sent to the browser on the response.
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  const done = (res: NextResponse) => { res.headers.set("Content-Security-Policy", csp); return res; };
  return done(await route(request, next));
}

async function route(request: NextRequest, next: () => NextResponse): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const protectedPath = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (protectedPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return next();
  }

  let response = next();

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|icon-512-maskable.png|apple-touch-icon.png|offline.html|sw.js|manifest.webmanifest|api/paystack/webhook|api/monnify/webhook).*)"],
};
