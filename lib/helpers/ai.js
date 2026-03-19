const axios = require('axios');

exports.chatgptSummarizeChatApi = async (chatPrompt, chatroomId) => {
  console.log('chatPrompt ==> ', chatPrompt);
  console.log('chatroomId ==> ', chatroomId);
  try {
    if (!chatPrompt) return null;

    const apiURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('ChatGPT Summarize API Error: OPENAI_API_KEY missing');
      return null;
    }

    const response = await axios.post(
      apiURL,
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: ` Summarize group chats into short, clear summaries in the form of paragraph less then 100 words: ${chatPrompt}`,
          },

        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      },
    );

    const raw = response?.data?.choices[0]?.message?.content || '';
    if (!raw) return null;

    return {
      summary: raw,
      raw,
      usage: response?.data?.usage || null,
    };
  } catch (error) {
    const errData = error.response.data || error.message || error;
    console.error('ChatGPT Summarize API Error:', errData);
    return null;
  }
};
