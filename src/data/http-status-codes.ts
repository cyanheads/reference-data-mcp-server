/**
 * @fileoverview HTTP status codes — IANA registry and common extensions.
 * Source: IANA HTTP Status Code Registry + RFC references.
 * @module data/http-status-codes
 */

export interface HttpStatusCode {
  cacheable: boolean;
  category: string;
  code: number;
  description: string;
  reason_phrase: string;
  rfc: string;
  rfc_section: string | null;
}

export const DATASET_VERSION = 'IANA HTTP Status Code Registry (2024)';

export const httpStatusCodes: HttpStatusCode[] = [
  // 1xx Informational
  {
    code: 100,
    reason_phrase: 'Continue',
    description:
      'The server has received the request headers and the client should proceed to send the request body.',
    category: '1xx Informational',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.2.1',
  },
  {
    code: 101,
    reason_phrase: 'Switching Protocols',
    description:
      'The requester has asked the server to switch protocols and the server has agreed to do so.',
    category: '1xx Informational',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.2.2',
  },
  {
    code: 102,
    reason_phrase: 'Processing',
    description:
      'The server has received and is processing the request, but no response is available yet (WebDAV).',
    category: '1xx Informational',
    cacheable: false,
    rfc: 'RFC 2518',
    rfc_section: '10.1',
  },
  {
    code: 103,
    reason_phrase: 'Early Hints',
    description:
      'Used with the Link header to allow the user agent to start preloading resources while the server prepares a response.',
    category: '1xx Informational',
    cacheable: false,
    rfc: 'RFC 8297',
    rfc_section: '2',
  },

  // 2xx Success
  {
    code: 200,
    reason_phrase: 'OK',
    description:
      'Standard response for successful HTTP requests. The actual response will depend on the request method used.',
    category: '2xx Success',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.3.1',
  },
  {
    code: 201,
    reason_phrase: 'Created',
    description: 'The request has been fulfilled, resulting in the creation of a new resource.',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.3.2',
  },
  {
    code: 202,
    reason_phrase: 'Accepted',
    description:
      'The request has been received but not yet acted upon. The request will be processed eventually.',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.3.3',
  },
  {
    code: 203,
    reason_phrase: 'Non-Authoritative Information',
    description:
      'The returned metadata is not exactly the same as is available from the origin server, but is collected from a local or a third-party copy.',
    category: '2xx Success',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.3.4',
  },
  {
    code: 204,
    reason_phrase: 'No Content',
    description: 'The server successfully processed the request and is not returning any content.',
    category: '2xx Success',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.3.5',
  },
  {
    code: 205,
    reason_phrase: 'Reset Content',
    description:
      'The server successfully processed the request, asks that the requester reset its document view, and is not returning any content.',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.3.6',
  },
  {
    code: 206,
    reason_phrase: 'Partial Content',
    description:
      'The server is delivering only part of the resource due to a range header sent by the client.',
    category: '2xx Success',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.3.7',
  },
  {
    code: 207,
    reason_phrase: 'Multi-Status',
    description:
      'The message body that follows is by default an XML message and can contain a number of separate response codes (WebDAV).',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 4918',
    rfc_section: '11.1',
  },
  {
    code: 208,
    reason_phrase: 'Already Reported',
    description:
      'The members of a DAV binding have already been enumerated in a preceding part of the (multistatus) response (WebDAV).',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 5842',
    rfc_section: '7.1',
  },
  {
    code: 226,
    reason_phrase: 'IM Used',
    description:
      'The server has fulfilled a request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance.',
    category: '2xx Success',
    cacheable: false,
    rfc: 'RFC 3229',
    rfc_section: '10.4.1',
  },

  // 3xx Redirection
  {
    code: 300,
    reason_phrase: 'Multiple Choices',
    description: 'Indicates multiple options for the resource from which the client may choose.',
    category: '3xx Redirection',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.4.1',
  },
  {
    code: 301,
    reason_phrase: 'Moved Permanently',
    description: 'This and all future requests should be directed to the given URI.',
    category: '3xx Redirection',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.4.2',
  },
  {
    code: 302,
    reason_phrase: 'Found',
    description: 'Tells the client to look at another URL. 302 has been superseded by 303 and 307.',
    category: '3xx Redirection',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.4.3',
  },
  {
    code: 303,
    reason_phrase: 'See Other',
    description: 'The response to the request can be found under another URI using the GET method.',
    category: '3xx Redirection',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.4.4',
  },
  {
    code: 304,
    reason_phrase: 'Not Modified',
    description:
      'Indicates that the resource has not been modified since the version specified by the request headers.',
    category: '3xx Redirection',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.4.5',
  },
  {
    code: 305,
    reason_phrase: 'Use Proxy',
    description:
      'The requested resource is available only through a proxy, the address for which is provided in the response. Deprecated.',
    category: '3xx Redirection',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.4.6',
  },
  {
    code: 307,
    reason_phrase: 'Temporary Redirect',
    description:
      'The request should be repeated with another URI, using the same method. Unlike 302, the request method must not change.',
    category: '3xx Redirection',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.4.8',
  },
  {
    code: 308,
    reason_phrase: 'Permanent Redirect',
    description:
      'The request and all future requests should be repeated using another URI. Unlike 301, the request method must not change.',
    category: '3xx Redirection',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.4.9',
  },

  // 4xx Client Error
  {
    code: 400,
    reason_phrase: 'Bad Request',
    description:
      'The server cannot process the request due to an apparent client error (e.g., malformed request syntax, invalid framing, or deceptive request routing).',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.1',
  },
  {
    code: 401,
    reason_phrase: 'Unauthorized',
    description: 'Authentication is required and has failed or has not yet been provided.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.2',
  },
  {
    code: 402,
    reason_phrase: 'Payment Required',
    description:
      'Reserved for future use. Some services use this for rate limiting or paid access.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.3',
  },
  {
    code: 403,
    reason_phrase: 'Forbidden',
    description:
      'The request contained valid data and was understood by the server, but the server is refusing action.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.4',
  },
  {
    code: 404,
    reason_phrase: 'Not Found',
    description:
      'The requested resource could not be found but may be available in the future. Subsequent requests by the client are permissible.',
    category: '4xx Client Error',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.5.5',
  },
  {
    code: 405,
    reason_phrase: 'Method Not Allowed',
    description: 'A request method is not supported for the requested resource.',
    category: '4xx Client Error',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.5.6',
  },
  {
    code: 406,
    reason_phrase: 'Not Acceptable',
    description:
      'The requested resource is capable of generating only content not acceptable according to the Accept headers.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.7',
  },
  {
    code: 407,
    reason_phrase: 'Proxy Authentication Required',
    description: 'The client must first authenticate itself with the proxy.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.8',
  },
  {
    code: 408,
    reason_phrase: 'Request Timeout',
    description:
      'The server timed out waiting for the request. The client should close this connection.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.9',
  },
  {
    code: 409,
    reason_phrase: 'Conflict',
    description:
      'Indicates that the request could not be processed because of conflict in the current state of the resource.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.10',
  },
  {
    code: 410,
    reason_phrase: 'Gone',
    description:
      'Indicates that the resource requested is no longer available and will not be available again.',
    category: '4xx Client Error',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.5.11',
  },
  {
    code: 411,
    reason_phrase: 'Length Required',
    description:
      'The request did not specify the length of its content, which is required by the requested resource.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.12',
  },
  {
    code: 412,
    reason_phrase: 'Precondition Failed',
    description:
      'The server does not meet one of the preconditions that the requester put on the request header fields.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.13',
  },
  {
    code: 413,
    reason_phrase: 'Content Too Large',
    description: 'The request is larger than the server is willing or able to process.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.14',
  },
  {
    code: 414,
    reason_phrase: 'URI Too Long',
    description: 'The URI provided was too long for the server to process.',
    category: '4xx Client Error',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.5.15',
  },
  {
    code: 415,
    reason_phrase: 'Unsupported Media Type',
    description:
      'The request entity has a media type which the server or resource does not support.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.16',
  },
  {
    code: 416,
    reason_phrase: 'Range Not Satisfiable',
    description:
      'The client has asked for a portion of the file, but the server cannot supply that portion.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.17',
  },
  {
    code: 417,
    reason_phrase: 'Expectation Failed',
    description: 'The server cannot meet the requirements of the Expect request-header field.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.18',
  },
  {
    code: 418,
    reason_phrase: "I'm a Teapot",
    description:
      "The server refuses the attempt to brew coffee with a teapot. Originally an April Fools' joke (RFC 2324); returned by some servers to indicate permanent refusal.",
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 2324',
    rfc_section: '2.3.2',
  },
  {
    code: 421,
    reason_phrase: 'Misdirected Request',
    description: 'The request was directed at a server that is not able to produce a response.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.20',
  },
  {
    code: 422,
    reason_phrase: 'Unprocessable Content',
    description:
      'The request was well-formed but was unable to be followed due to semantic errors (WebDAV).',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.21',
  },
  {
    code: 423,
    reason_phrase: 'Locked',
    description: 'The resource that is being accessed is locked (WebDAV).',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 4918',
    rfc_section: '11.3',
  },
  {
    code: 424,
    reason_phrase: 'Failed Dependency',
    description:
      'The request failed because it depended on another request and that request failed (WebDAV).',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 4918',
    rfc_section: '11.4',
  },
  {
    code: 425,
    reason_phrase: 'Too Early',
    description:
      'Indicates that the server is unwilling to risk processing a request that might be replayed.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 8470',
    rfc_section: '5.2',
  },
  {
    code: 426,
    reason_phrase: 'Upgrade Required',
    description: 'The client should switch to a different protocol such as TLS/1.3.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.5.22',
  },
  {
    code: 428,
    reason_phrase: 'Precondition Required',
    description: 'The origin server requires the request to be conditional.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 6585',
    rfc_section: '3',
  },
  {
    code: 429,
    reason_phrase: 'Too Many Requests',
    description: 'The user has sent too many requests in a given amount of time (rate limiting).',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 6585',
    rfc_section: '4',
  },
  {
    code: 431,
    reason_phrase: 'Request Header Fields Too Large',
    description:
      'The server is unwilling to process the request because either an individual header field, or all the header fields collectively, are too large.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 6585',
    rfc_section: '5',
  },
  {
    code: 451,
    reason_phrase: 'Unavailable For Legal Reasons',
    description:
      'A server operator has received a legal demand to deny access to a resource or to a set of resources.',
    category: '4xx Client Error',
    cacheable: false,
    rfc: 'RFC 7725',
    rfc_section: '3',
  },

  // 5xx Server Error
  {
    code: 500,
    reason_phrase: 'Internal Server Error',
    description:
      'A generic error message, given when an unexpected condition was encountered and no more specific message is suitable.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.6.1',
  },
  {
    code: 501,
    reason_phrase: 'Not Implemented',
    description:
      'The server either does not recognize the request method, or it lacks the ability to fulfil the request.',
    category: '5xx Server Error',
    cacheable: true,
    rfc: 'RFC 9110',
    rfc_section: '15.6.2',
  },
  {
    code: 502,
    reason_phrase: 'Bad Gateway',
    description:
      'The server was acting as a gateway or proxy and received an invalid response from the upstream server.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.6.3',
  },
  {
    code: 503,
    reason_phrase: 'Service Unavailable',
    description:
      'The server cannot handle the request (because it is overloaded or down for maintenance). Generally, this is a temporary state.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.6.4',
  },
  {
    code: 504,
    reason_phrase: 'Gateway Timeout',
    description:
      'The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.6.5',
  },
  {
    code: 505,
    reason_phrase: 'HTTP Version Not Supported',
    description: 'The server does not support the HTTP protocol version used in the request.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 9110',
    rfc_section: '15.6.6',
  },
  {
    code: 506,
    reason_phrase: 'Variant Also Negotiates',
    description: 'Transparent content negotiation for the request results in a circular reference.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 2295',
    rfc_section: '8.1',
  },
  {
    code: 507,
    reason_phrase: 'Insufficient Storage',
    description:
      'The server is unable to store the representation needed to complete the request (WebDAV).',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 4918',
    rfc_section: '11.5',
  },
  {
    code: 508,
    reason_phrase: 'Loop Detected',
    description: 'The server detected an infinite loop while processing the request (WebDAV).',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 5842',
    rfc_section: '7.2',
  },
  {
    code: 510,
    reason_phrase: 'Not Extended',
    description: 'Further extensions to the request are required for the server to fulfil it.',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 2774',
    rfc_section: '7',
  },
  {
    code: 511,
    reason_phrase: 'Network Authentication Required',
    description: 'The client needs to authenticate to gain network access (e.g., captive portals).',
    category: '5xx Server Error',
    cacheable: false,
    rfc: 'RFC 6585',
    rfc_section: '6',
  },
];
