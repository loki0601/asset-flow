'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useSignIn } from '@/components/AuthProvider';
import { login } from '@/lib/auth';
import { AuroraMark } from '@/components/AuroraMark';

export default function LoginPage() {
  const router = useRouter();
  const signIn = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      if (!user) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      signIn(user.id);
      router.replace('/');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-brand-surface flex flex-col px-8"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <AuroraMark size="w-16 h-16" />
          </div>
          <span className="text-[10px] font-black tracking-[0.3em] text-brand-sage uppercase">
            Asset Flow
          </span>
          <h1 className="text-2xl font-black text-brand-ink mt-1 leading-tight tracking-tight">
            자산을 한 곳에서 관리해요
          </h1>
          <p className="text-[11px] text-brand-sage mt-1.5 font-semibold">
            기존 계정으로 로그인하거나 새 계정을 만들어 시작하세요
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
          <div className="space-y-3">
            {error && (
              <div className="px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-[12px] font-bold bg-rose-50 text-rose-500 border border-rose-100">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <IconInput
              icon={<User size={18} />}
              type="text"
              placeholder="아이디"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              autoCapitalize="none"
            />

            <div className="relative">
              <IconInput
                icon={<Lock size={18} />}
                type={showPassword ? 'text' : 'password'}
                placeholder="비밀번호"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                rightPadding
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-sage active:opacity-60"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-14 rounded-2xl bg-brand text-white font-black text-sm shadow-lg shadow-brand/20 disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>로그인 중…</span>
                </>
              ) : (
                <span>로그인</span>
              )}
            </button>
          </div>

          {/* Action links */}
          <div className="flex justify-center items-center gap-3 text-[11px] text-brand-sage font-bold mt-5">
            <Link
              href="/signup"
              className="text-brand active:opacity-60"
            >
              회원가입
            </Link>
            <span className="text-brand-line">|</span>
            <span className="opacity-50 select-none">아이디 찾기</span>
            <span className="text-brand-line">|</span>
            <span className="opacity-50 select-none">비밀번호 재설정</span>
          </div>
        </form>

      </div>

      {/* Compliance footer anchored to bottom of screen */}
      <p className="w-full text-[10px] text-brand-sage text-center font-medium leading-normal pt-6">
        모든 자산 데이터는 디바이스에 로컬 저장됩니다.
        <br />
        서버 백업은 사용자의 명시적 동작이 있을 때만 진행됩니다.
      </p>
    </main>
  );
}

function IconInput({
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  autoCapitalize,
  rightPadding,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoCapitalize?: string;
  rightPadding?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-sage">
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        className={`w-full h-14 pl-12 ${rightPadding ? 'pr-12' : 'pr-4'} rounded-2xl bg-white border border-brand-line text-[14px] font-semibold text-brand-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-colors`}
        required
      />
    </div>
  );
}
