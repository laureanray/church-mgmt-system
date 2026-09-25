import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MemberQr } from "./member-qr";

// A real, scannable code for SAMPLE_TOKEN, rendered once by `qrcode` with the
// margin and error correction `lib/qr.ts` uses, at preview size. Precomputed
// so the story needs no server module.
const SAMPLE_QR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAAAklEQVR4AewaftIAAASnSURBVO3BUY4kB3YEQY+Huv+VQwT0u1EjJDdnmpSbpX9B0n90SJoOSdMhaTokTYek6ZA0HZKmD7+QhH+TtrwhCU+1ZUnCN2353ZLwb9KW5ZA0HZKmQ9J0SJoOSdMhafrwN7Tlp0nCW5KwtGVJwjdJWNryTRKeaMtb2vLTJOGJQ9J0SJoOSdMhaTokTYek6ZA0fXhREt7Qljck4Zu2vKEtb2jLT5OEN7TlDYek6ZA0HZKmQ9J0SJoOSdMH/Vck4Q1JeCoJS1v0a4ek6ZA0HZKmQ9J0SJoOSdMhafqg/4q2LEl4S1uWJCxJ+KYtgkPSdEiaDknTIWk6JE2HpOnDi9ryb5KEpS1PJWFpyzdJeKItf0Jb/kkOSdMhaTokTYek6ZA0HZKmD39DEv4/acuShKUt3yThDW1ZkvBNW55Kwr/FIWk6JE2HpOmQNB2SpkPSdEiaPvxCW/S/krC0ZUnCN235J2nL/xeHpOmQNB2SpkPSdEiaDknTh19IwtKWb5Lw07Rlacs3SViS8IYkPJWENyThp2nLGw5J0yFpOiRNh6TpkDQdkqZD0vThF9qyJOEtbVmSsLTlqSQ81ZankvCGtjyVhDe0ZUnCN21ZkvBUW5ZD0nRImg5J0yFpOiRNh6Qp/Qs/UBJ+mrYsSVja8ick4am2PJWEJ9ryTRLe0JblkDQdkqZD0nRImg5J0yFp+vBDtWVJwtKWtyRhacufkIQn2vJP05YlCW84JE2HpOmQNB2SpkPSdEiaDknTh19Iwhva8lRbliQ81ZZv2vKGJCxteaotb0jCU215KglLW75JwhOHpOmQNB2SpkPSdEiaDknThxe1ZUnCN215oi1vScITbfmmLb9bEp5qyzdJeENbliR805YnDknTIWk6JE2HpOmQNB2SpkPSlP6FL5KwtOUtSXhDW55Kwu/Wlm+S8ERbvknCU215IgnftOWpJCxtWQ5J0yFpOiRNh6TpkDQdkqYPf0gSnmrLU0l4Q1uWJHzTlqfasiThp0nC0pa3tOWJQ9J0SJoOSdMhaTokTYek6cOLkrC05ZskLEl4qi1LEr5py5KEn6YtSxLekoQnkvBNW5YkPNWW5ZA0HZKmQ9J0SJoOSdMhaTokTR9+oS1PteWptvw0SVja8lQSnmrLkoSn2vKGJCxt+WkOSdMhaTokTYek6ZA0HZKmD7+QhH+Ttixt+RPasiThmyT8bkn4pi1vSMLvdkiaDknTIWk6JE2HpOmQNB2Spg9/Q1t+miQ8lYQ3tOWbJDzVlieS8FRb/oS2LEl4wyFpOiRNh6TpkDQdkqZD0vThRUl4Q1v+hLb8bm35JglvSILgkDQdkqZD0nRImg5J0yFp+qA/ri1PtWVJwtKWb5LwuyXhpzkkTYek6ZA0HZKmQ9J0SJoOSdMH/Z8lYWnLkoSn2vJUW55qy++WhG/a8lQSnjgkTYek6ZA0HZKmQ9J0SJo+vKgt/yRt+RPa8lQS3tCWNyRhactPc0iaDknTIWk6JE2HpOmQNB2Spg9/QxL+TZLwTVuWJPwJbfknacsbkvCGQ9J0SJoOSdMhaTokTYekKf0Lkv6jQ9J0SJoOSdMhaTokTYek6X8A1gKCn8/tEfMAAAAASUVORK5CYII=";

const SAMPLE_TOKEN = "V1StGXR8_Z5jdHi6B-myT";

const meta = {
  title: "Members/MemberQr",
  component: MemberQr,
  args: { dataUrl: SAMPLE_QR, name: "Ana Reyes", token: SAMPLE_TOKEN },
  parameters: { layout: "centered" },
} satisfies Meta<typeof MemberQr>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A member's attendance code on their profile page. Print opens a popup laid
 * out for a card printer; Download saves the PNG under the member's name.
 */
export const Default: Story = {};

/**
 * A name full of markup still prints as plain text. The print popup shares
 * the app's origin, so this is the case that must never be parsed as HTML.
 */
export const MarkupInName: Story = {
  args: { name: '<img src=x onerror="alert(1)"> Reyes' },
};
