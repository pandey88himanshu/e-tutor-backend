import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (_, __, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;

        // ✅ FIX 1: Check by BOTH email AND googleId
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email }, // Existing user with same email
              { googleId }, // Existing Google account
            ],
          },
        });

        return done(null, {
          googleProfile: profile,
          user, // may be null for new users
        });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;
