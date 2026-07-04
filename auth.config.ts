import type { NextAuthConfig } from "next-auth";

import type { UserRole } from "@/lib/constants";

// Edge-safe config: no Node-only imports (bcrypt/db live in auth.ts).
// Used by middleware to decode the JWT and by the full NextAuth instance.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
