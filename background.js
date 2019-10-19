'use strict';

const TRUTH = 'https://shibboleth.nyu.edu/';
const STAY_MILLIS = 5000; // ok notification duration
const IGNORE_DUPLICATE_MILLIS = 1000;  
// if Chrome loads the same URL mulitple times within a short time, ignore duplicates
const AVOID_RACE_CONDITION = 100; //  poor fix
const SIMILARITY_THRESHOLD = 8;

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
    console.warn('Possible fake NYU login page!', {
      'URL difference score': distance, 
    });
    return true;
  } else {
    return false;
  }
};

const hash = async function (url) {
  const s = url.substring(0, TRUTH.length);
  const bufView = new Uint16Array(s.length);
  for (let i = s.length - 1; i >= 0; i--) {
    bufView[i] = s.charCodeAt(i);
  }
  const hashed = await crypto.subtle.digest('SHA-256', bufView);
  return (new Uint16Array(hashed)).toString();
};

const onNewPage = (url) => {
  console.log('Verifying', url);
  if (url.startsWith(TRUTH)) {
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
  }
};

const garbageCollect = function (id) {
  chrome.storage.local.get('gc', (result) => {
    if (result.gc !== id) {
      console.warn('Very rare race condition: gc id mismatch');
      if (result.gc) {
        return;
      } else {
        chrome.storage.local.clear();
        return;
      }
    }
    chrome.storage.local.get('time', (result) => {
      if (result.time) {
        if (new Date() - result.time > IGNORE_DUPLICATE_MILLIS) {
          chrome.storage.local.clear();
          console.log('gc', id, 'finished');
        } else {
          setTimeout(garbageCollect.bind(null, id), IGNORE_DUPLICATE_MILLIS);
        }
      }
    });
  });
}

const randId = function () {
  return Math.floor(Math.random() * 100000).toString();
};

const wakeGarbageCollector = function () {
  chrome.storage.local.get('gc', (result) => {
    if (! result.gc) {
      const id = randId();
      chrome.storage.local.set({gc: id});
      setTimeout(function (id) {
        chrome.storage.local.get('gc', (result) => {
          if (result.gc === id) {
            setTimeout(
              garbageCollect.bind(null, id), 
              IGNORE_DUPLICATE_MILLIS, 
            );
          }
        });
      }.bind(null, id), AVOID_RACE_CONDITION + IGNORE_DUPLICATE_MILLIS);
    }
  });
};

chrome.tabs.onUpdated.addListener((_, _2, { url }) => {
  chrome.storage.local.set({time: + new Date()});
  hash(url).then((hashed) => {
    chrome.storage.local.get(hashed, (result) => {
      if (! result[hashed]) {
        const id = randId();
        chrome.storage.local.set({[hashed]: id});
        setTimeout(function (id, hashed) {
          chrome.storage.local.get(hashed, (result) => {
            if (result[hashed] === id) {
              onNewPage(url);
            } else {
              console.log('Ignoring', url);
            }
          });
        }.bind(null, id, hashed), AVOID_RACE_CONDITION);
      } else {
        console.log('Ignoring', url);
      }
      wakeGarbageCollector();
    });
  });
});
