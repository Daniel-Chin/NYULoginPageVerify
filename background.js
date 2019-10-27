'use strict';

const TRUTH = 'https://shibboleth.nyu.edu/';
const STAY_MILLIS = 5000; // ok notification duration
const IGNORE_DUPLICATE_MILLIS = 8000;  
// if Chrome loads the same URL mulitple times within a short time, ignore duplicates
const SIMILARITY_THRESHOLD = 8;

let last_banner = {
  safe: true, 
  time: 0, 
};

const editDistance = function (a, b, a_i, b_i, cache) {
  const lookup = (cache[a_i] || {})[b_i];
  if (lookup !== undefined) {
    return lookup;
  }
  if (a_i < 0 || b_i < 0) {
    return Infinity;
  }
  const match = a[a_i - 1] === b[b_i - 1];
  const candidates = [];
  candidates.push((match ? 0 : 1) + editDistance(
    a, b, a_i - 1, b_i - 1, cache, 
  ));
  candidates.push(1 + editDistance(a, b, a_i, b_i - 1, cache));
  candidates.push(1 + editDistance(a, b, a_i - 1, b_i, cache));
  const result = Math.min(...candidates);
  if (! cache[a_i]) {
    cache[a_i] = {};
  }
  cache[a_i][b_i] = result;
  return result;
};

const isSimilar = (url) => {
  const s = url.substring(0, TRUTH.length).toLowerCase();
  const cache = {0: {0: 0}};
  const distance = editDistance(
    TRUTH, s, 
    TRUTH.length, TRUTH.length, 
    cache
  );
  if (distance < SIMILARITY_THRESHOLD) {
    console.log('Possible fake NYU login page!', {
      'URL difference score': distance, 
    });
    return true;
  } else {
    return false;
  }
};

const onNewPage = (url) => {
  if (url.startsWith(TRUTH)) {
    console.log('Verified', url);
    if (last_banner.safe && new Date() - last_banner.time < IGNORE_DUPLICATE_MILLIS) {
      return;
    }
    last_banner = {
      time: + new Date(), 
      safe: true, 
    };
    chrome.notifications.create('', {
      type:     'basic',
      iconUrl:  'images/ok.png',
      title:    'NYU Login Page Verified',
      message:  'You opened a genuine NYU page. ',
      contextMessage: `Only type password if you see this notification.`, 
      priority: 0, 
      silent: true, 
    }, (id) => {
      setTimeout(
        chrome.notifications.clear.bind(null, id), 
        STAY_MILLIS, 
      );
    });
  } else if (isSimilar(url)) {
    console.log('Danger', url);
    if (! last_banner.safe && new Date() - last_banner.time < IGNORE_DUPLICATE_MILLIS) {
      return;
    }
    last_banner = {
      time: + new Date(), 
      safe: false, 
    };
    chrome.notifications.create('', {
      type:     'basic',
      iconUrl:  'images/warning.png',
      title:    'Warning: possible fake NYU page! ',
      message:  `The URL is similar but not identical to "${TRUTH}"`,
      buttons: [
        {title: 'Dismiss'}
      ],
      priority: 2, 
      requireInteraction: true, 
    });
  } else {
    console.log('Not verified', url);
  }
};

chrome.tabs.onUpdated.addListener((_, _2, { url }) => {
  onNewPage(url);
});
