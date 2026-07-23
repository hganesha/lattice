import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LatticeAuthProvider } from './AuthProvider'
import { LatticeI18nProvider } from './i18n/I18nProvider'

const mocks = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  }
  const client = {
    auth,
    from: vi.fn(),
    rpc: vi.fn(),
  }
  return { auth, client }
})

vi.mock('./supabase', () => ({ supabase: mocks.client }))

function invitedUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'invited@example.com',
    invited_at: '2026-07-22T12:00:00.000Z',
    app_metadata: {},
    user_metadata: metadata,
    created_at: '2026-07-22T12:00:00.000Z',
  }
}

function sessionFor(user: User): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
}

function renderProvider() {
  return render(<LatticeI18nProvider><LatticeAuthProvider><div>Authenticated workspace</div></LatticeAuthProvider></LatticeI18nProvider>)
}

describe('Supabase account activation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    vi.clearAllMocks()
    mocks.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    mocks.client.from.mockImplementation(() => ({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    mocks.auth.signOut.mockResolvedValue({ error: null })
  })

  it('sends a password recovery link back to the current Studio route', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderProvider()

    await user.click(await screen.findByRole('button', { name: 'Forgot password?' }))
    await user.type(screen.getByLabelText('Email'), ' invited@example.com ')
    await user.click(screen.getByRole('button', { name: 'Send recovery link →' }))

    await waitFor(() => expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith('invited@example.com', {
      redirectTo: `${window.location.origin}/?auth_action=update-password`,
    }))
    expect(screen.getByRole('status')).toHaveTextContent('If this account exists, a recovery link has been sent.')
  })

  it('requires an invited user to set a policy-compliant password before onboarding', async () => {
    const originalUser = invitedUser()
    const activatedUser = invitedUser({ lattice_invite_completed: true })
    mocks.auth.getSession.mockResolvedValue({ data: { session: sessionFor(originalUser) }, error: null })
    mocks.auth.updateUser.mockResolvedValue({ data: { user: activatedUser }, error: null })
    const user = userEvent.setup()
    renderProvider()

    expect(await screen.findByRole('heading', { name: 'Activate your Lattice account' })).toBeVisible()
    await user.type(screen.getByLabelText('New password'), 'too-short')
    await user.type(screen.getByLabelText('Confirm password'), 'too-short')
    await user.click(screen.getByRole('button', { name: 'Set password →' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters with lowercase, uppercase, a number, and a symbol.')
    expect(mocks.auth.updateUser).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('New password'))
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('New password'), 'SecurePass1!')
    await user.type(screen.getByLabelText('Confirm password'), 'SecurePass1!')
    await user.click(screen.getByRole('button', { name: 'Set password →' }))

    await waitFor(() => expect(mocks.auth.updateUser).toHaveBeenCalledWith({
      password: 'SecurePass1!',
      data: { lattice_invite_completed: true },
    }))
    expect(await screen.findByRole('heading', { name: 'Create your organization' })).toBeVisible()
  })
})
