import Layout from '../components/Layout';

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <div className="py-8 space-y-8 text-gray-300">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: July 2025</p>
        </div>

        <Section title="Overview">
          <p>
            VibeQueue ("we", "us", "our") is a collaborative music queue application. This policy
            explains what data we collect, why we collect it, and how it is handled when you sign
            in with your Google account.
          </p>
        </Section>

        <Section title="Data We Collect">
          <p>When you connect your Google / YouTube account we request the following OAuth scopes:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>
              <code className="text-xs bg-gray-800 px-1 py-0.5 rounded text-gray-300">email</code>
              {' '}— your Google account email address, used to identify your session and display
              your account in the app header.
            </li>
            <li>
              <code className="text-xs bg-gray-800 px-1 py-0.5 rounded text-gray-300">https://www.googleapis.com/auth/youtube.readonly</code>
              {' '}— read-only access to your YouTube account, used exclusively to read your
              playlists and Liked Songs so you can browse and queue songs inside a room.
            </li>
          </ul>
          <p className="mt-3">
            We do <strong className="text-white">not</strong> read, modify, or access your watch
            history, subscriptions, comments, uploads, or any other YouTube data beyond playlists
            and Liked Songs.
          </p>
        </Section>

        <Section title="How We Use Your Data">
          <ul className="list-disc pl-5 space-y-1">
            <li>To authenticate you and maintain your session while you are in a room.</li>
            <li>To display your playlists so you can queue songs for the room.</li>
            <li>To show your display name to other room participants.</li>
          </ul>
          <p className="mt-3">
            Your YouTube access token is stored only in your server-side session and is never
            written to a persistent database. It expires when your session ends.
          </p>
        </Section>

        <Section title="Data Sharing">
          <p>
            We do <strong className="text-white">not</strong> sell, rent, or share your personal
            data or Google account data with any third party. Playlist and video data fetched from
            YouTube is used in real time and is not stored beyond the lifetime of your session.
          </p>
        </Section>

        <Section title="Google API Services">
          <p>
            VibeQueue uses the YouTube Data API v3. Our use of data received from Google APIs
            complies with the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Data Retention">
          <p>
            Session data (including your YouTube access token) is automatically deleted when your
            session expires or when you sign out. We do not retain any Google account data after
            your session ends.
          </p>
        </Section>

        <Section title="Revoking Access">
          <p>
            You can revoke VibeQueue's access to your Google account at any time by visiting{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Google Account Permissions
            </a>{' '}
            and removing VibeQueue from the list of connected apps.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All communication between your browser and our servers is encrypted via HTTPS. Access
            tokens are stored server-side in signed, HTTP-only session cookies and are never
            exposed to client-side JavaScript.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            VibeQueue is not directed at children under 13. We do not knowingly collect personal
            data from children under 13.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have questions about this privacy policy or how your data is handled, please
            contact us at{' '}
            <a
              href="mailto:vibequeueapp@gmail.com"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              vibequeueapp@gmail.com
            </a>
            .
          </p>
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}
