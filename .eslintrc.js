module.exports = {
  extends: 'airbnb-base',
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-console': 'off',
    'max-len': 'off',
    'no-underscore-dangle': 'off',
    'consistent-return': ['off'],
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-nested-ternary': 'off',
    'no-await-in-loop': 'off',
    'no-continue': 'off',
  },
};
