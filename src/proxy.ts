import { auth } from "@/auth";

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isPreviewPage = req.nextUrl.pathname.startsWith("/preview");
  // SlackはNextAuthのセッションを持たず、署名検証（/api/slack/*内部で実施）で保護しているため、
  // ここでログイン画面へリダイレクトすると、そのHTMLがそのままSlack側にエラーメッセージとして
  // 表示されてしまう。API側でリダイレクトさせない。
  const isSlackApi = req.nextUrl.pathname.startsWith("/api/slack/");

  if (!isLoggedIn && !isLoginPage && !isPreviewPage && !isSlackApi) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
