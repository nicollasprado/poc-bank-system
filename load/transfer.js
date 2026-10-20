import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const RATE = Number(__ENV.RATE || 1000);
const ACCOUNTS = Number(__ENV.ACCOUNTS || 10000);

export const options = {
  scenarios: {
    transfers: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_reqs: [`rate>=${RATE * 0.99}`],
    http_req_duration: ['p(99)<300'],
  },
};

function accountId(i) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

function randomAccount() {
  return 1 + Math.floor(Math.random() * ACCOUNTS);
}

export default function () {
  const from = randomAccount();
  let to = randomAccount();
  while (to === from) to = randomAccount();

  http.post(
    `${BASE_URL}/transfer`,
    JSON.stringify({
      toAccountId: accountId(to),
      amount: 1 + Math.floor(Math.random() * 1000),
    }),
    {
      headers: {
        'x-account-id': accountId(from),
        'content-type': 'application/json',
      },
    },
  );
}
