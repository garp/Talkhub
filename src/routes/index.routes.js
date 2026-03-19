const express = require('express');
const session = require('express-session');

const app = express();
const passport = require('passport');

const user = require('./user.routes');
const hashtag = require('./hashtag.routes');
const interest = require('./interest.routes');
const chatroom = require('./chatroom.routes');
const privateChatroom = require('./privateChatroom.routes');
const post = require('./post.routes');
const feed = require('./feed.routes');
const profile = require('./profile.routes');
const userInteraction = require('./userInteraction.routes');
const reportUser = require('./report.routes');
const reportGroup = require('./reportGroup.routes');
const notification = require('./notiifcation.route');
const stories = require('./stories.routes');
const goodWork = require('./goodWork.routes');
const follow = require('./follow.routes');
const highlightCollection = require('./highlightCollection.routes');
const people = require('./people.routes');
const search = require('./search.routes');
const settings = require('./settings.routes');
const ai = require('./ai.routes');
const globalSearch = require('./globalSearch.routes');
const favourite = require('./favourite.routes');
const shortlink = require('./shortlink.routes');
const repost = require('./repost.routes');
const temp = require('./temp.routes');

app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session());

app.use('/user', user);
app.use('/hashtag', hashtag);
app.use('/interest', interest);
app.use('/chatroom', chatroom);
app.use('/private-chatroom', privateChatroom);
app.use('/post', post);
app.use('/feed', feed);
app.use('/profile', profile);
app.use('/userInteraction', userInteraction);
app.use('/reportUser', reportUser);
app.use('/reportGroup', reportGroup);
app.use('/notification', notification);
app.use('/stories', stories);
app.use('/good-work-himanshu', goodWork);
app.use('/follow', follow);
app.use('/highlight-collection', highlightCollection);
app.use('/people', people);
app.use('/settings', settings);
app.use('/ai', ai);
app.use('/global-search', globalSearch);
app.use('/favourite', favourite);
app.use('/shortlink', shortlink);
app.use('/repost', repost);
app.use('/temp', temp);
app.use('/', search);

module.exports = app;
