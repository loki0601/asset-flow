'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User,
  UserCircle2,
} from 'lucide-react';
import { createId } from '@paralleldrive/cuid2';
import { useSignIn } from '@/components/AuthProvider';
import { useHoldingsData } from '@/components/HoldingsDataProvider';
import { signup } from '@/lib/auth';
import { familyRepo } from '@/lib/repos';
import type { FamilyMember } from '@/lib/schema';

export default function SignupPage() {
  const router = useRouter();
  const signIn = useSignIn();
  const { refresh: refreshHoldingsData } = useHoldingsData();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !username.trim() || !password || !confirm) {
      setError('모든 필수 항목을 입력해 주세요.');
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await signup(username, password);
      // The 성명 field doubles as the first family member's name — keeps
      // the onboarding short by skipping the standalone "구성원 추가"
      // step. Account creation still happens in /onboarding step 2.
      const member: FamilyMember = {
        id: createId(),
        userId: user.id,
        name: name.trim(),
        createdAt: new Date().toISOString(),
      };
      familyRepo.add(user.id, member);
      refreshHoldingsData();
      signIn(user.id);
      // Onboarding's useEffect detects the existing member and jumps the
      // wizard straight to the account step.
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-brand-surface flex flex-col px-8"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
        <div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[12px] font-black text-brand active:opacity-60 mb-5"
          >
            <ArrowLeft size={16} />
            <span>로그인으로 돌아가기</span>
          </Link>
          <div className="w-16 h-16 bg-brand rounded-[22px] flex items-center justify-center text-white shadow-lg shadow-brand/20 mb-4">
            <ShieldCheck size={32} />
          </div>
          <span className="text-[10px] font-black tracking-[0.3em] text-brand-sage uppercase">
            Asset Flow
          </span>
          <h2 className="text-2xl font-black text-brand-ink mt-1 leading-tight">
            새 계정 만들기
          </h2>
          <p className="text-[11px] text-brand-sage mt-1.5 font-semibold">
            성명은 첫 구성원의 이름으로 등록돼요. 다른 가족 자산도 함께
            관리하려면 가입 후 설정에서 구성원을 추가해 주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-3 flex-1 flex flex-col">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-[12px] font-bold bg-rose-50 text-rose-500 border border-rose-100">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <FieldRow
            icon={<UserCircle2 size={18} />}
            type="text"
            placeholder="성명 (예: 홍길동)"
            value={name}
            onChange={setName}
            autoComplete="name"
            maxLength={30}
          />
          <FieldRow
            icon={<User size={18} />}
            type="text"
            placeholder="아이디 (영문/숫자)"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            autoCapitalize="none"
            minLength={2}
          />
          <FieldRow
            icon={<Lock size={18} />}
            type={showPassword ? 'text' : 'password'}
            placeholder="비밀번호 (4자 이상)"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={4}
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-brand-sage active:opacity-60"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
          <FieldRow
            icon={<Lock size={18} />}
            type={showPassword ? 'text' : 'password'}
            placeholder="비밀번호 다시 입력"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={4}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-14 rounded-2xl bg-brand text-white font-black text-sm shadow-lg shadow-brand/20 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>가입 중…</span>
              </>
            ) : (
              <span>가입하고 시작하기</span>
            )}
          </button>
        </form>

        <p className="text-[10px] text-brand-sage text-center font-medium leading-normal mt-6">
          가입 시 모든 자산·대출·노후 데이터는
          <br />
          이 디바이스의 로컬 IndexedDB 에만 저장됩니다.
        </p>
      </div>
    </main>
  );
}

function FieldRow({
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  autoCapitalize,
  minLength,
  maxLength,
  rightAdornment,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoCapitalize?: string;
  minLength?: number;
  maxLength?: number;
  rightAdornment?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-sage">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        minLength={minLength}
        maxLength={maxLength}
        className={`w-full h-14 pl-12 ${rightAdornment ? 'pr-12' : 'pr-4'} rounded-2xl bg-white border border-brand-line text-[14px] font-semibold text-brand-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-colors`}
        required
      />
      {rightAdornment && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2">{rightAdornment}</span>
      )}
    </div>
  );
}
