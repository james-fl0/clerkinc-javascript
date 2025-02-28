import { render, userEvent, waitFor } from '@clerk/shared/testUtils';
import type { OrganizationInvitationResource, OrganizationMembershipResource } from '@clerk/types';
import { describe, it } from '@jest/globals';

import { bindCreateFixtures } from '../../../utils/test/createFixtures';
import { OrganizationMembers } from '../OrganizationMembers';
import { createFakeMember, createFakeOrganizationInvitation, createFakeOrganizationMembershipRequest } from './utils';

const { createFixtures } = bindCreateFixtures('OrganizationProfile');

describe('OrganizationMembers', () => {
  it('renders the Organization Members page', async () => {
    const { wrapper } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({ email_addresses: ['test@clerk.dev'], organization_memberships: ['Org1'] });
    });

    const { getByText, getByRole } = render(<OrganizationMembers />, { wrapper });

    await waitFor(() => {
      expect(getByRole('heading', { name: /members/i })).toBeInTheDocument();
      expect(getByText('View and manage organization members')).toBeInTheDocument();
    });

    await waitFor(() => {
      // Tabs
      expect(getByRole('tab', { name: 'Members' })).toBeInTheDocument();
      expect(getByRole('tab', { name: 'Invitations' })).toBeInTheDocument();
    });
  });

  it('shows requests if domains is turned on', async () => {
    const { wrapper } = await createFixtures(f => {
      f.withOrganizations();
      f.withOrganizationDomains();
      f.withUser({ email_addresses: ['test@clerk.dev'], organization_memberships: ['Org1'] });
    });

    const { getByRole } = render(<OrganizationMembers />, { wrapper });

    await waitFor(() => {
      expect(getByRole('tab', { name: 'Requests' })).toBeInTheDocument();
    });
  });

  it('shows an invite button inside invitations tab if the current user is an admin', async () => {
    const { wrapper } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({ email_addresses: ['test@clerk.dev'], organization_memberships: [{ name: 'Org1', role: 'admin' }] });
    });

    const { getByRole, getByText } = render(<OrganizationMembers />, { wrapper });
    await userEvent.click(getByRole('tab', { name: 'Invitations' }));

    await waitFor(() => {
      expect(getByText('Invited')).toBeDefined();
      expect(getByRole('button', { name: 'Invite' })).toBeDefined();
    });
  });

  it('does not show invitations and requests if user is not an admin', async () => {
    const { wrapper } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({
        email_addresses: ['test@clerk.dev'],
        organization_memberships: [{ name: 'Org1', role: 'basic_member' }],
      });
    });

    const { queryByRole } = render(<OrganizationMembers />, { wrapper });

    await waitFor(() => {
      expect(queryByRole('tab', { name: 'Invitations' })).not.toBeInTheDocument();
      expect(queryByRole('tab', { name: 'Requests' })).not.toBeInTheDocument();
    });
  });

  it('navigates to invite screen when user clicks on Invite button', async () => {
    const { wrapper, fixtures } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({ email_addresses: ['test@clerk.dev'], organization_memberships: [{ name: 'Org1', role: 'admin' }] });
    });

    const { getByRole } = render(<OrganizationMembers />, { wrapper });
    await userEvent.click(getByRole('tab', { name: 'Invitations' }));
    await userEvent.click(getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(fixtures.router.navigate).toHaveBeenCalledWith('invite-members');
    });
  });

  it('lists all the members of the Organization', async () => {
    const membersList: OrganizationMembershipResource[] = [
      createFakeMember({
        id: '1',
        orgId: '1',
        role: 'admin',
        identifier: 'test_user1',
        firstName: 'First1',
        lastName: 'Last1',
        createdAt: new Date('2022-01-01'),
      }),
      createFakeMember({
        id: '2',
        orgId: '1',
        role: 'basic_member',
        identifier: 'test_user2',
        firstName: 'First2',
        lastName: 'Last2',
        createdAt: new Date('2022-01-01'),
      }),
    ];
    const { wrapper, fixtures } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({
        email_addresses: ['test@clerk.dev'],
        organization_memberships: [{ name: 'Org1', id: '1', role: 'admin' }],
      });
    });

    fixtures.clerk.organization?.getMemberships.mockReturnValue(Promise.resolve(membersList));
    const { queryByText } = render(<OrganizationMembers />, { wrapper });
    expect(fixtures.clerk.organization?.getMemberships).toHaveBeenCalled();
    expect(fixtures.clerk.organization?.getPendingInvitations).not.toHaveBeenCalled();
    expect(fixtures.clerk.organization?.getMembershipRequests).not.toHaveBeenCalled();
    expect(queryByText('test_user1')).toBeDefined();
    expect(queryByText('First1 Last1')).toBeDefined();
    expect(queryByText('Admin')).toBeDefined();
    expect(queryByText('test_user2')).toBeDefined();
    expect(queryByText('First2 Last2')).toBeDefined();
    expect(queryByText('Member')).toBeDefined();
  });

  it.todo('removes member from organization when clicking the respective button on a user row');
  it.todo('changes role on a member from organization when clicking the respective button on a user row');
  it('changes tab and renders the pending invites list', async () => {
    const invitationList: OrganizationInvitationResource[] = [
      createFakeOrganizationInvitation({
        id: '1',
        role: 'admin',
        emailAddress: 'admin1@clerk.dev',
        organizationId: '1',
        createdAt: new Date('2022-01-01'),
      }),
      createFakeOrganizationInvitation({
        id: '2',
        role: 'basic_member',
        emailAddress: 'member2@clerk.dev',
        organizationId: '1',
        createdAt: new Date('2022-01-01'),
      }),
    ];
    const { wrapper, fixtures } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({
        email_addresses: ['test@clerk.dev'],
        organization_memberships: [{ name: 'Org1', id: '1', role: 'admin' }],
      });
    });

    fixtures.clerk.organization?.getPendingInvitations.mockReturnValue(Promise.resolve(invitationList));
    const { queryByText, getByRole } = render(<OrganizationMembers />, { wrapper });
    await userEvent.click(getByRole('tab', { name: 'Invitations' }));
    expect(fixtures.clerk.organization?.getPendingInvitations).toHaveBeenCalled();
    expect(queryByText('admin1@clerk.dev')).toBeDefined();
    expect(queryByText('Admin')).toBeDefined();
    expect(queryByText('member2@clerk.dev')).toBeDefined();
    expect(queryByText('Member')).toBeDefined();
  });

  it('changes tab and renders pending requests', async () => {
    const requests = {
      data: [
        createFakeOrganizationMembershipRequest({
          id: '1',
          publicUserData: {
            userId: '1',
            identifier: 'admin1@clerk.dev',
          },
          organizationId: '1',
          createdAt: new Date('2022-01-01'),
        }),
        createFakeOrganizationMembershipRequest({
          id: '2',
          publicUserData: {
            userId: '1',
            identifier: 'member2@clerk.dev',
          },
          organizationId: '1',
          createdAt: new Date('2022-01-01'),
        }),
      ],
      total_count: 4,
    };
    const { wrapper, fixtures } = await createFixtures(f => {
      f.withOrganizations();
      f.withOrganizationDomains();
      f.withUser({
        email_addresses: ['test@clerk.dev'],
        organization_memberships: [{ name: 'Org1', id: '1', role: 'admin' }],
      });
    });

    fixtures.clerk.organization?.getDomains.mockReturnValue(
      Promise.resolve({
        data: [],
        total_count: 0,
      }),
    );
    fixtures.clerk.organization?.getMembershipRequests.mockReturnValue(Promise.resolve(requests));
    const { queryByText, getByRole } = render(<OrganizationMembers />, { wrapper });
    await userEvent.click(getByRole('tab', { name: 'Requests' }));
    expect(fixtures.clerk.organization?.getMembershipRequests).toHaveBeenCalledWith({
      initialPage: 1,
      pageSize: 10,
      status: 'pending',
    });

    expect(queryByText('admin1@clerk.dev')).toBeInTheDocument();
    expect(queryByText('member2@clerk.dev')).toBeInTheDocument();
  });

  it('shows the "You" badge when the member id from the list matches the current session user id', async () => {
    const membersList: OrganizationMembershipResource[] = [
      createFakeMember({ id: '1', orgId: '1', role: 'admin', identifier: 'test_user1' }),
      createFakeMember({ id: '2', orgId: '1', role: 'basic_member', identifier: 'test_user2' }),
    ];
    const { wrapper, fixtures } = await createFixtures(f => {
      f.withOrganizations();
      f.withUser({
        id: '1',
        email_addresses: ['test@clerk.dev'],
        organization_memberships: [{ name: 'Org1', id: '1', role: 'admin' }],
      });
    });

    fixtures.clerk.organization?.getMemberships.mockReturnValue(Promise.resolve(membersList));
    const { findByText } = render(<OrganizationMembers />, { wrapper });
    await waitFor(() => expect(fixtures.clerk.organization?.getMemberships).toHaveBeenCalled());
    expect(await findByText('You')).toBeDefined();
  });
});
