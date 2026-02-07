import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    },
    async (_, __, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email from Google"), null);
        }

        const dbUser = await prisma.user.findFirst({
          where: {
            OR: [{ email }, { googleId: profile.id }],
          },
        });

        return done(null, {
          dbUser, // ✅ MATCH CONTROLLER
          profile, // ✅ MATCH CONTROLLER
        });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;
