import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('roulette roster screen', () => {
  it('renders the Korean roster headings and empty states', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '다중 회전 룰렛' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '참가자' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '벌칙 / 순번' })).toBeInTheDocument();
    expect(screen.getAllByText('아직 등록된 항목이 없습니다.')).toHaveLength(2);
  });

  it('shows a commitment before revealing the server seed at session end', async () => {
    const user = userEvent.setup();
    render(<App />);

    const commitment = await screen.findByLabelText('세션 커밋먼트');
    expect(commitment.textContent).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.queryByText(/공개된 서버 시드/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '세션 종료 및 시드 공개' }));
    expect(await screen.findByText(/공개된 서버 시드/)).toBeInTheDocument();
  });

  it('removes only the selected duplicate-name participant after a reduced-motion draw', async () => {
    localStorage.setItem('participants', JSON.stringify(['동명이인', '동명이인']));
    localStorage.setItem('penalties', JSON.stringify(['벌칙']));
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('세션 커밋먼트');

    await user.click(await screen.findByRole('button', { name: '룰렛 돌리기' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/결과: 동명이인/);
    const canvas = screen.getByRole('img', { name: /참가자 룰렛/ });
    const segments: unknown = JSON.parse(
      canvas.getAttribute('data-wheel-segments') ?? '[]',
    );
    expect(Array.isArray(segments)).toBe(true);
    expect(segments).toHaveLength(1);
  });

  it('adds a participant when Enter is pressed and persists the legacy list', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole('textbox', { name: '참가자 이름을 입력하세요' }),
      '민지{Enter}',
    );

    expect(screen.getByText('민지')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('participants') ?? '[]')).toEqual(['민지']);
  });
});
