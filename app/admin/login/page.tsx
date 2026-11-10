import AdminLogin from "../../AdminLogin";
import WorkshopLogo from "../../WorkshopLogo";
import Link from "next/link";

export default function AdminLoginPage() {
  return <main className="admin-login-page">
    <Link className="admin-login-back" href="/">← 返回星界工坊</Link>
    <section className="contact-window admin-login-window admin-login-card">
      <span className="contact-star workshop-contact-logo"><WorkshopLogo /></span>
      <AdminLogin allowActivation />
    </section>
  </main>;
}

