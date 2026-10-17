import { getServerSession, type NextAuthOptions, type DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "~/server/db";
import { env } from "~/env";
import { upsertGoogleUser, type GoogleProfileLike } from "~/server/auth-google";
import bcrypt from "bcryptjs";

/** Google sign-in is only offered when both OAuth values are configured. */
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep them type-safe.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
      },
    }),
    signIn: async ({ account, profile }) => {
      if (account?.provider !== "google") return true;
      // Only let a Google-verified email in; this also creates the account on first sign-in.
      const dbUser = await upsertGoogleUser((profile ?? {}) as GoogleProfileLike);
      return Boolean(dbUser);
    },
    jwt: async ({ token, user, account, profile }) => {
      if (account?.provider === "google") {
        // For Google the session must carry OUR user id, not Google's account id.
        const dbUser = await upsertGoogleUser((profile ?? {}) as GoogleProfileLike);
        if (dbUser) {
          token.id = dbUser.id;
          token.name = dbUser.displayName ?? dbUser.name ?? token.name;
        }
      } else if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Login Email", type: "text", placeholder: "hero@asl.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.displayName ?? user.name,
          email: user.email,
        };
      }
    }),
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
