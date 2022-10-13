import React from 'react';

import { getClerkQueryParam } from '../../../utils/getClerkQueryParam';
import { ERROR_CODES } from '../../common/constants';
import { withRedirectToHome } from '../../common/withRedirectToHome';
import { useCoreClerk, useCoreSignUp, useEnvironment, useSignUpContext } from '../../contexts';
import { descriptors, Flex, Flow, localizationKeys, useAppearance } from '../../customizables';
import {
  Card,
  CardAlert,
  Footer,
  Header,
  LoadingCard,
  SocialButtonsReversibleContainerWithDivider,
  withCardStateProvider,
} from '../../elements';
import { useCardState } from '../../elements/contexts';
import { useNavigate } from '../../hooks';
import { useLoadingStatus } from '../../hooks';
import { buildRequest, FormControlState, handleError, useFormControl } from '../../utils';
import { SignUpForm } from './SignUpForm';
import {
  ActiveIdentifier,
  determineActiveFields,
  emailOrPhone,
  getInitialActiveIdentifier,
  showFormFields,
} from './signUpFormHelpers';
import { SignUpSocialButtons } from './SignUpSocialButtons';
import { completeSignUpFlow } from './util';

function _SignUpStart(): JSX.Element {
  const card = useCardState();
  const status = useLoadingStatus();
  const signUp = useCoreSignUp();
  const { showOptionalFields } = useAppearance().parsedLayout;
  const { userSettings, displayConfig } = useEnvironment();
  const { navigate } = useNavigate();
  const { attributes } = userSettings;
  const { setActive } = useCoreClerk();
  const { navigateAfterSignUp, signInUrl } = useSignUpContext();
  const [activeCommIdentifierType, setActiveCommIdentifierType] = React.useState<ActiveIdentifier>(
    getInitialActiveIdentifier(attributes, userSettings.signUp.progressive),
  );
  const [missingRequirementsWithTicket, setMissingRequirementsWithTicket] = React.useState(false);

  const formState = {
    firstName: useFormControl('firstName', '', {
      type: 'text',
      label: localizationKeys('formFieldLabel__firstName'),
      placeholder: localizationKeys('formFieldInputPlaceholder__firstName'),
    }),
    lastName: useFormControl('lastName', '', {
      type: 'text',
      label: localizationKeys('formFieldLabel__lastName'),
      placeholder: localizationKeys('formFieldInputPlaceholder__lastName'),
    }),
    emailAddress: useFormControl('emailAddress', '', {
      type: 'email',
      label: localizationKeys('formFieldLabel__emailAddress'),
      placeholder: localizationKeys('formFieldInputPlaceholder__emailAddress'),
    }),
    username: useFormControl('username', '', {
      type: 'text',
      label: localizationKeys('formFieldLabel__username'),
      placeholder: localizationKeys('formFieldInputPlaceholder__username'),
    }),
    phoneNumber: useFormControl('phoneNumber', '', {
      type: 'tel',
      label: localizationKeys('formFieldLabel__phoneNumber'),
      placeholder: localizationKeys('formFieldInputPlaceholder__phoneNumber'),
    }),
    password: useFormControl('password', '', {
      type: 'password',
      label: localizationKeys('formFieldLabel__password'),
      placeholder: localizationKeys('formFieldInputPlaceholder__password'),
    }),
    ticket: useFormControl(
      'ticket',
      getClerkQueryParam('__clerk_ticket') || getClerkQueryParam('__clerk_invitation_token') || '',
    ),
  } as const;

  const hasTicket = !!formState.ticket.value;
  const hasEmail = !!formState.emailAddress.value;
  const isProgressiveSignUp = userSettings.signUp.progressive;

  const fields = determineActiveFields({
    attributes,
    hasTicket,
    hasEmail,
    activeCommIdentifierType,
    isProgressiveSignUp,
  });

  const handleTokenFlow = () => {
    if (!formState.ticket.value) {
      return;
    }
    status.setLoading();
    card.setLoading();
    signUp
      .create({ strategy: 'ticket', ticket: formState.ticket.value })
      .then(signUp => {
        formState.emailAddress.setValue(signUp.emailAddress || '');
        // In case we are in a Ticket flow and the sign up is not complete yet, update the state
        // to render properly the SignUp form with other available options to complete it (e.g. OAuth)
        if (signUp.status === 'missing_requirements') {
          setMissingRequirementsWithTicket(true);
        }

        return completeSignUpFlow({
          signUp,
          verifyEmailPath: 'verify-email-address',
          verifyPhonePath: 'verify-phone-number',
          handleComplete: () => setActive({ session: signUp.createdSessionId, beforeEmit: navigateAfterSignUp }),
          navigate,
        });
      })
      .catch(err => {
        /* Clear ticket values when an error occurs in the initial sign up attempt */
        formState.ticket.setValue('');
        handleError(err, [], card.setError);
      })
      .finally(() => {
        status.setIdle();
        card.setIdle();
      });
  };

  React.useLayoutEffect(() => {
    // Don't proceed with token flow if there are still optional fields to fill in
    if (Object.values(fields).some(f => f && !f.required)) {
      return;
    }
    void handleTokenFlow();
  }, []);

  React.useEffect(() => {
    async function handleOauthError() {
      const error = signUp.verifications.externalAccount.error;

      if (error) {
        switch (error.code) {
          case ERROR_CODES.NOT_ALLOWED_TO_SIGN_UP:
          case ERROR_CODES.OAUTH_ACCESS_DENIED:
          case ERROR_CODES.NOT_ALLOWED_ACCESS:
            card.setError(error.longMessage);
            break;
          default:
            // Error from server may be too much information for the end user, so set a generic error
            card.setError('Unable to complete action at this time. If the problem persists please contact support.');
        }

        // TODO: This is a hack to reset the sign in attempt so that the oauth error
        // does not persist on full page reloads.
        // We will revise this strategy as part of the Clerk DX epic.
        void (await signUp.create({}));
      }
    }

    void handleOauthError();
  }, []);

  const handleChangeActive = (type: ActiveIdentifier) => {
    if (!emailOrPhone(attributes, isProgressiveSignUp)) {
      return;
    }
    setActiveCommIdentifierType(type);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    type FormStateKey = keyof typeof formState;
    const fieldsToSubmit = Object.entries(fields).reduce(
      (acc, [k, v]) => [...acc, ...(v && formState[k as FormStateKey] ? [formState[k as FormStateKey]] : [])],
      [] as Array<FormControlState>,
    );

    if (fields.ticket) {
      const noop = () => {
        //
      };
      // fieldsToSubmit: Constructing a fake fields object for strategy.
      fieldsToSubmit.push({ id: 'strategy', value: 'ticket', setValue: noop, onChange: noop, setError: noop } as any);
    }

    // In case of emailOrPhone (both email & phone are optional) and neither of them is provided,
    // add both to the submitted fields to trigger and render an error for both respective inputs
    const emailAddressProvided = !!(fieldsToSubmit.find(f => f.id === 'emailAddress')?.value || '');
    const phoneNumberProvided = !!(fieldsToSubmit.find(f => f.id === 'phoneNumber')?.value || '');

    if (!emailAddressProvided && !phoneNumberProvided && emailOrPhone(attributes, isProgressiveSignUp)) {
      fieldsToSubmit.push(formState['emailAddress']);
      fieldsToSubmit.push(formState['phoneNumber']);
    }

    card.setLoading();
    card.setError(undefined);
    return signUp
      .create(buildRequest(fieldsToSubmit))
      .then(res =>
        completeSignUpFlow({
          signUp: res,
          verifyEmailPath: 'verify-email-address',
          verifyPhonePath: 'verify-phone-number',
          handleComplete: () => setActive({ session: res.createdSessionId, beforeEmit: navigateAfterSignUp }),
          navigate,
        }),
      )
      .catch(err => handleError(err, fieldsToSubmit, card.setError))
      .finally(() => card.setIdle());
  };

  if (status.isLoading) {
    return <LoadingCard />;
  }

  const canToggleEmailPhone = emailOrPhone(attributes, isProgressiveSignUp);
  const visibleFields = Object.entries(fields).filter(([_, opts]) => showOptionalFields || opts?.required);
  const shouldShowForm = showFormFields(userSettings) && visibleFields.length > 0;

  const showOauthProviders =
    (!hasTicket || missingRequirementsWithTicket) && userSettings.socialProviderStrategies.length > 0;
  const showWeb3Providers = !hasTicket && userSettings.web3FirstFactors.length > 0;

  return (
    <Flow.Part part='start'>
      <Card>
        <CardAlert>{card.error}</CardAlert>
        <Header.Root>
          <Header.Title localizationKey={localizationKeys('signUp.start.title')}>Create your account</Header.Title>
          <Header.Subtitle localizationKey={localizationKeys('signUp.start.subtitle')}>
            to continue to {displayConfig.applicationName}
          </Header.Subtitle>
        </Header.Root>
        <Flex
          direction='col'
          elementDescriptor={descriptors.main}
          gap={8}
        >
          <SocialButtonsReversibleContainerWithDivider>
            {(showOauthProviders || showWeb3Providers) && (
              <SignUpSocialButtons
                enableOAuthProviders={showOauthProviders}
                enableWeb3Providers={showWeb3Providers}
              />
            )}
            {shouldShowForm && (
              <SignUpForm
                handleSubmit={handleSubmit}
                fields={fields}
                formState={formState}
                canToggleEmailPhone={canToggleEmailPhone}
                handleEmailPhoneToggle={handleChangeActive}
              />
            )}
          </SocialButtonsReversibleContainerWithDivider>
        </Flex>
        <Footer.Root>
          <Footer.Action>
            <Footer.ActionText localizationKey={localizationKeys('signUp.start.actionText')}>
              Have an account?
            </Footer.ActionText>
            <Footer.ActionLink
              localizationKey={localizationKeys('signUp.start.actionLink')}
              to={signInUrl}
            />
          </Footer.Action>
          <Footer.Links />
        </Footer.Root>
      </Card>
    </Flow.Part>
  );
}

export const SignUpStart = withRedirectToHome(withCardStateProvider(_SignUpStart));