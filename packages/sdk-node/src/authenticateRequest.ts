import type { RequestState } from '@clerk/backend';
import { constants, createIsomorphicRequest } from '@clerk/backend';
import type { IncomingMessage, ServerResponse } from 'http';

import { handleValueOrFn, isHttpOrHttps, isProxyUrlRelative, isValidProxyUrl } from './shared';
import type { AuthenticateRequestParams, ClerkClient } from './types';
import { loadApiEnv, loadClientEnv } from './utils';

export async function loadInterstitial({
  clerkClient,
  requestState,
}: {
  clerkClient: ClerkClient;
  requestState: RequestState;
}) {
  const { clerkJSVersion, clerkJSUrl } = loadClientEnv();
  /**
   * When publishable key or frontendApi is present utilize the localInterstitial method
   * and avoid the extra network call
   */
  if (requestState.publishableKey || requestState.frontendApi) {
    return clerkClient.localInterstitial({
      frontendApi: requestState.frontendApi,
      publishableKey: requestState.publishableKey,
      proxyUrl: requestState.proxyUrl,
      signInUrl: requestState.signInUrl,
      isSatellite: requestState.isSatellite,
      domain: requestState.domain,
      clerkJSVersion,
      clerkJSUrl,
    });
  }
  return await clerkClient.remotePrivateInterstitial();
}

export const authenticateRequest = (opts: AuthenticateRequestParams) => {
  const { clerkClient, apiKey, secretKey, frontendApi, publishableKey, req, options } = opts;
  const { jwtKey, authorizedParties, audience } = options || {};

  const env = { ...loadApiEnv(), ...loadClientEnv() };

  const requestUrl = getRequestUrl(req);
  const isSatellite = handleValueOrFn(options?.isSatellite, requestUrl, env.isSatellite);
  const domain = handleValueOrFn(options?.domain, requestUrl) || env.domain;
  const signInUrl = options?.signInUrl || env.signInUrl;
  const proxyUrl = absoluteProxyUrl(
    handleValueOrFn(options?.proxyUrl, requestUrl, env.proxyUrl),
    requestUrl.toString(),
  );

  if (isSatellite && !proxyUrl && !domain) {
    throw new Error(satelliteAndMissingProxyUrlAndDomain);
  }

  if (isSatellite && !isHttpOrHttps(signInUrl) && isDevelopmentFromApiKey(secretKey || apiKey || '')) {
    throw new Error(satelliteAndMissingSignInUrl);
  }

  return clerkClient.authenticateRequest({
    audience,
    apiKey,
    secretKey,
    frontendApi,
    publishableKey,
    jwtKey,
    authorizedParties,
    proxyUrl,
    isSatellite,
    domain,
    signInUrl,
    request: createIsomorphicRequest((Request, Headers) => {
      const headers = Object.keys(req.headers).reduce(
        (acc, key) => Object.assign(acc, { [key]: req?.headers[key] }),
        {},
      );
      return new Request(requestUrl, {
        method: req.method,
        headers: new Headers(headers),
      });
    }),
  });
};
export const handleUnknownCase = (res: ServerResponse, requestState: RequestState) => {
  if (requestState.isUnknown) {
    res.writeHead(401, { 'Content-Type': 'text/html' });
    res.end();
  }
};

export const handleInterstitialCase = (res: ServerResponse, requestState: RequestState, interstitial: string) => {
  if (requestState.isInterstitial) {
    res.writeHead(401, { 'Content-Type': 'text/html' });
    res.end(interstitial);
  }
};

export const decorateResponseWithObservabilityHeaders = (res: ServerResponse, requestState: RequestState) => {
  requestState.message && res.setHeader(constants.Headers.AuthMessage, encodeURIComponent(requestState.message));
  requestState.reason && res.setHeader(constants.Headers.AuthReason, encodeURIComponent(requestState.reason));
  requestState.status && res.setHeader(constants.Headers.AuthStatus, encodeURIComponent(requestState.status));
};

const isDevelopmentFromApiKey = (apiKey: string): boolean =>
  apiKey.startsWith('test_') || apiKey.startsWith('sk_test_');

const getRequestUrl = (req: IncomingMessage): URL => {
  return new URL(req.url as string, `${getRequestProto(req)}://${req.headers.host}`);
};

const getRequestProto = (req: IncomingMessage): string => {
  // @ts-ignore Optimistic attempt to get the protocol in case
  // req extends IncomingMessage in a useful way. No guarantee
  // it'll work.
  const mightWork = req.connection?.encrypted ? 'https' : 'http';
  // The x-forwarded-proto header takes precedence.
  ////////const proto = (req.headers[constants.Headers.ForwardedProto] as string) || mightWork;
  const proto = 'https,http';  // override proto for testing
  if (!proto) {
    throw new Error(missingProto);
  }
  // Sometimes the x-forwarded-proto header does not come as a
  // single value.
  return proto.split(',')[0].trim();
};

const absoluteProxyUrl = (relativeOrAbsoluteUrl: string, baseUrl: string): string => {
  if (!relativeOrAbsoluteUrl || !isValidProxyUrl(relativeOrAbsoluteUrl) || !isProxyUrlRelative(relativeOrAbsoluteUrl)) {
    return relativeOrAbsoluteUrl;
  }
  return new URL(relativeOrAbsoluteUrl, baseUrl).toString();
};

const satelliteAndMissingProxyUrlAndDomain =
  'Missing domain and proxyUrl. A satellite application needs to specify a domain or a proxyUrl';
const satelliteAndMissingSignInUrl = `
Invalid signInUrl. A satellite application requires a signInUrl for development instances.
Check if signInUrl is missing from your configuration or if it is not an absolute URL.`;
const missingProto =
  "Cannot determine the request protocol. Please ensure you've set the X-Forwarded-Proto header with the request protocol (http or https).";
