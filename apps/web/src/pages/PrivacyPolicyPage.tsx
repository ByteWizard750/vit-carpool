import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { CURRENT_PRIVACY_VERSION } from '@vit-carpool/contracts';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <PageShell width="narrow">
      <div style={{ marginBottom: '16px' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />}>
            Back to Home
          </Button>
        </Link>
      </div>

      <PageHeader
        title="Privacy Policy"
        description={`Our institutional data protection commitment and privacy charter. Version ${CURRENT_PRIVACY_VERSION} • Effective November 2026.`}
      />

      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-light, #e2e8f0)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          lineHeight: '1.7',
          color: '#334155',
          fontSize: '0.925rem',
        }}
      >
        {/* Core Institutional Privacy Shield Notice */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#ecfdf5',
            borderRadius: '12px',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <Lock size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#059669' }} />
          <div>
            <strong>Institutional Privacy Shield:</strong> Your phone number, precise pickup coordinates, and student registration details are <em>never</em> publicly searchable or indexed. They are shared strictly with confirmed trip peers after mutual booking acceptance.
          </div>
        </div>

        {/* Section 1 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            1. Data Controller &amp; Campus Context
          </h2>
          <p>
            VIT Carpool is operated by student platform administrators in collaboration with verified campus community contributors. For inquiries concerning personal data handling or grievance redressal, contact our data coordinator at <a href="mailto:privacy@vitcarpool.app" style={{ color: '#2563eb' }}>privacy@vitcarpool.app</a>.
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            2. Information We Collect
          </h2>
          <p>We process the minimum necessary personal data required to operate safe campus carpooling:</p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li><strong>Institutional Identity:</strong> Official full name, verified email (<code>@vitstudent.ac.in</code> or <code>@vit.ac.in</code>), academic cohort (Student or Faculty), and optional profile photograph.</li>
            <li><strong>Trip Information:</strong> Planned origin and destination landmarks, departure timings, seat allocations, and cost-sharing amounts.</li>
            <li><strong>Real-Time Location Telemetry:</strong> Precise GPS coordinates transmitted by drivers during active trips to provide live tracking to confirmed passengers.</li>
            <li><strong>Vehicle Information:</strong> Make, model, color, registration number, and seat capacity (for drivers publishing private drives).</li>
            <li><strong>Direct Communications:</strong> In-app chat messages exchanged between confirmed ride participants.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            3. Purpose and Legal Basis of Processing
          </h2>
          <p>Your personal information is collected and processed strictly to:</p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li>Authenticate verified institutional membership and enforce audience safety.</li>
            <li>Match commuters traveling along common campus transit corridors.</li>
            <li>Facilitate pickup communication and real-time transit tracking.</li>
            <li>Investigate safety incidents, harassment reports, and policy breaches.</li>
            <li>Comply with legitimate legal and campus safety obligations.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            4. Audience Isolation &amp; Privacy Safeguards
          </h2>
          <p>
            Our architecture incorporates strict audience segmentation:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li>Student commuters and Faculty commuters operate in separate cohorts by default, preserving appropriate campus privacy boundaries.</li>
            <li>Telephone numbers are encrypted in our primary database and revealed strictly on confirmed booking summaries.</li>
            <li>Live GPS tracking activates only upon ride commencement and immediately concludes upon destination arrival.</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            5. Data Retention &amp; Security Measures
          </h2>
          <p>
            Data is stored in secured AWS cloud infrastructure within regional data centers. Telemetry coordinate breadcrumbs are purged within 30 days of ride completion. User profiles remain active while institutional affiliation is valid. All communications in transit use TLS 1.3 encryption, and administrative database access requires multi-factor authentication (MFA).
          </p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            6. Your Privacy Rights
          </h2>
          <p>Under applicable Indian data protection frameworks, you have the right to:</p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li>Access and inspect personal data associated with your profile.</li>
            <li>Rectify inaccurate contact or vehicle information.</li>
            <li>Withdraw consent and request permanent account deactivation and data erasure.</li>
            <li>Block other members to prevent mutual visibility and communication.</li>
          </ul>
        </section>

        {/* Section 7 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            7. Contact &amp; Grievance Redressal
          </h2>
          <p>
            If you have questions, feedback, or grievance requests concerning this Privacy Policy, please write to our Privacy Officer at <a href="mailto:privacy@vitcarpool.app" style={{ color: '#2563eb' }}>privacy@vitcarpool.app</a>.
          </p>
        </section>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.825rem', color: '#64748b' }}>
        Read our full <Link to="/terms" style={{ color: '#2563eb' }}>Terms &amp; Conditions</Link>
      </div>
    </PageShell>
  );
};
