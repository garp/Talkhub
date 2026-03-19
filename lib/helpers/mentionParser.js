/**
 * Mention Parser Utility
 * Extracts @username mentions from text (similar to Instagram/Twitter)
 */

/**
 * Regular expression to match @username mentions
 * - Starts with @
 * - Followed by alphanumeric characters, underscores, or dots
 * - Minimum 1 character, maximum 30 characters after @
 * - Handles mentions at start, middle, or end of text
 * - Handles multiple mentions in same text
 */
const MENTION_REGEX = /@([a-zA-Z0-9_.]{1,30})\b/g;

/**
 * Extract all @usernames from text
 * @param {string} text - The text to parse for mentions
 * @returns {string[]} - Array of unique usernames (without @ symbol)
 *
 * @example
 * extractMentions("Hello @john and @jane!")
 * // Returns: ["john", "jane"]
 *
 * @example
 * extractMentions("Check this @user1 @user2 @user1")
 * // Returns: ["user1", "user2"] (deduplicated)
 */
const extractMentions = (text) => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches = text.match(MENTION_REGEX);
  if (!matches) {
    return [];
  }

  // Remove @ symbol and deduplicate (case-insensitive)
  const usernames = matches.map((match) => match.substring(1).toLowerCase());
  const uniqueUsernames = [...new Set(usernames)];

  return uniqueUsernames;
};

/**
 * Check if text contains any mentions
 * @param {string} text - The text to check
 * @returns {boolean} - True if text contains at least one mention
 */
const hasMentions = (text) => {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return MENTION_REGEX.test(text);
};

/**
 * Count the number of unique mentions in text
 * @param {string} text - The text to parse
 * @returns {number} - Number of unique mentions
 */
const countMentions = (text) => extractMentions(text).length;

/**
 * Replace mentions with formatted links or styled text
 * @param {string} text - The original text
 * @param {function} formatter - Function to format each mention (receives username, returns replacement)
 * @returns {string} - Text with formatted mentions
 *
 * @example
 * formatMentions("Hello @john!", (username) => `<a href="/user/${username}">@${username}</a>`)
 * // Returns: 'Hello <a href="/user/john">@john</a>!'
 */
const formatMentions = (text, formatter) => {
  if (!text || typeof text !== 'string' || typeof formatter !== 'function') {
    return text;
  }

  return text.replace(MENTION_REGEX, (match, username) => formatter(username));
};

/**
 * Check if message content includes the "mention everyone in hashtag" trigger.
 * User passes @hashtag (literal) or @<hashtagName> (e.g. @TechNews) to notify all participants.
 * @param {string} content - Message content
 * @param {string} [hashtagName] - Optional hashtag name (e.g. "TechNews") to also match @TechNews
 * @returns {boolean}
 */
const contentIncludesHashtagMentionEveryone = (content, hashtagName) => {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase();
  if (lower.includes('@hashtag')) return true;
  if (hashtagName && typeof hashtagName === 'string' && hashtagName.trim()) {
    const name = hashtagName.trim().toLowerCase();
    return lower.includes(`@${name}`);
  }
  return false;
};

/**
 * Check if message content includes the "mention everyone in group" trigger.
 * User passes @everyone to notify all group participants (private group chat only).
 * @param {string} content - Message content
 * @returns {boolean}
 */
const contentIncludesEveryoneMention = (content) => {
  if (!content || typeof content !== 'string') return false;
  return content.toLowerCase().includes('@everyone');
};

module.exports = {
  MENTION_REGEX,
  extractMentions,
  hasMentions,
  countMentions,
  formatMentions,
  contentIncludesHashtagMentionEveryone,
  contentIncludesEveryoneMention,
};
