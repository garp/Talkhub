const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
// const AppleStrategy = require('passport-apple').Strategy;
const env = require('../../lib/configs/env.config');
const services = require('./userServices');
const { logInfo } = require('../../lib/helpers/logger');
const { userStatus, userLoginModes } = require('../../lib/constants/userConstants');

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/user/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const user = await services.findOne({ filter: { email } });

        if (user) {
          return done(null, user);
        }

        const newUser = await services.create({
          body: {
            email,
            status: userStatus.CREATED,
            trackingCode: uuidv4(),
            emailVerified: true,
            mode: userLoginModes.google,
          },
        });
        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

passport.use(
  new FacebookStrategy(
    {
      clientID: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      callbackURL: '/user/auth/facebook/callback',
      profileFields: ['emails'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = (profile.emails && profile.emails[0].value) || null;

        if (!email) {
          return done(new Error('No email found'), null);
        }

        const user = await services.findOne({ filter: { email } });

        if (user) {
          return done(null, user);
        }

        const newUser = await services.create({
          body: {
            email,
            status: userStatus.CREATED,
            trackingCode: uuidv4(),
            emailVerified: true,
            mode: userLoginModes.facebook,
          },
        });
        logInfo('New User:', newUser);
        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

// passport.use(
//   new AppleStrategy(
//     {
//       clientID: env.APPLE_CLIENT_ID,
//       teamID: env.APPLE_TEAM_ID,
//       keyID: env.APPLE_KEY_ID,
//       privateKeyString: env.APPLE_PRIVATE_KEY,
//       callbackURL: '/user/auth/apple/callback',
//       passReqToCallback: true,
//     },
//     async (req, accessToken, refreshToken, idToken, profile, done) => {
//       try {
//         const email = profile.email || null;

//         if (!email) {
//           return done(new Error('No email found'), null);
//         }

//         const user = await services.findOne({ filter: { email } });

//         if (user) {
//           logInfo('Existing User:', user);
//           return done(null, user);
//         }

//         const newUser = await services.create({
//           body: {
//             email,
//             status: userStatus.created,
//           },
//         });

//         logInfo('New User:', newUser);
//         return done(null, newUser);
//       } catch (error) {
//         logInfo('Error in Apple Strategy:', error);
//         return done(error, null);
//       }
//     },
//   ),
// );

passport.serializeUser((user, done) => {
  logInfo('Serializing user:', user);
  const { _id: userId } = user;
  return done(null, userId);
});

passport.deserializeUser(async (id, done) => {
  logInfo('Deserializing user with id:', id);
  try {
    const user = await services.findById({ id });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
