import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [household, setHousehold] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const loadHousehold = useCallback(async (userId) => {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, role, households(id, name)')
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) {
      setHousehold(null)
      setMembers([])
      return
    }

    setHousehold({ id: membership.household_id, name: membership.households?.name, role: membership.role })

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('user_id, role, profiles(id, full_name)')
      .eq('household_id', membership.household_id)

    setMembers(memberRows || [])
  }, [])

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return
      setSession(session)
      if (session?.user) {
        await Promise.all([loadProfile(session.user.id), loadHousehold(session.user.id)])
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session?.user) {
        await Promise.all([loadProfile(session.user.id), loadHousehold(session.user.id)])
      } else {
        setProfile(null)
        setHousehold(null)
        setMembers([])
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile, loadHousehold])

  async function signInWithEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshHousehold() {
    if (session?.user) await loadHousehold(session.user.id)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    household,
    members,
    loading,
    signInWithEmail,
    signOut,
    refreshHousehold,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth må brukes inne i AuthProvider')
  return ctx
}
