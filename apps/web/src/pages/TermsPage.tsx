import React from 'react';
import { Link } from 'react-router-dom';
import { Scale, ArrowLeft } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { CURRENT_TERMS_VERSION } from '@vit-carpool/contracts';

export const TermsPage: React.FC = () => {
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
        title="Terms & Conditions"
        description={`Official campus carpooling charter and user expectations. Version ${CURRENT_TERMS_VERSION} • Effective November 2026.`}
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
        {/* Notice Banner */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#eff6ff',
            borderRadius: '12px',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <Scale size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Campus Notice &amp; Legal Transparency:</strong> VIT Carpool is an independent, non-commercial student-led mobility network connecting verified students and faculty of the VIT Chennai community. These Terms establish mutual responsibilities between members and the platform. These terms do not restrict or override any mandatory statutory rights available to you under applicable law.
          </div>
        </div>

        {/* Section 1 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            1. Platform Purpose and Scope
          </h2>
          <p>
            VIT Carpool provides an automated technology communication and software matchmaking network exclusively designed for verified members of the Vellore Institute of Technology (VIT) Chennai campus. The platform facilitates peer-to-peer ride coordination for daily commutes, campus transit, and shared airport/railway journeys. The platform operates on a non-commercial, zero-profit model: no brokerage, commission, booking fee, or surge pricing is charged by the platform.
          </p>
          <p style={{ marginTop: '8px' }}>
            <strong>Intermediary Software Notice:</strong> VIT Carpool is strictly a peer-to-peer communication platform and does not provide transportation services, act as a transportation carrier, operate taxis, or employ drivers. All travel arrangements are voluntary peer agreements made independently between adult campus community members.
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            2. User Eligibility and Institutional Registration
          </h2>
          <p>
            Access is strictly restricted to current students, research scholars, faculty, and authorized staff of VIT Chennai. To register:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li>You must hold an active, verified institutional email address ending in <code>@vitstudent.ac.in</code> or <code>@vit.ac.in</code>.</li>
            <li>You must authenticate via one-time verification codes sent to your registered institutional address.</li>
            <li>Accounts are strictly personal and non-transferable. You must not permit third parties to book rides, publish drives, or send messages using your account.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            3. Accuracy of User Information and Verification
          </h2>
          <p>
            You represent and warrant that all personal data, vehicle registration details, driving license numbers, and profile information provided by you are authentic, accurate, and current. Submitting forged institutional credentials or falsified vehicle data constitutes a material breach resulting in immediate account termination and referral to campus authorities.
          </p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            4. Ride Creation, Booking, and Cancellation
          </h2>
          <p>
            <strong>Offerings:</strong> Drivers may publish planned travel routes including estimated departure time, designated pickup landmarks, and available seats.
          </p>
          <p>
            <strong>Bookings:</strong> Passengers submit seat reservation requests. Seat reservations are finalized only upon explicit driver confirmation.
          </p>
          <p>
            <strong>Cancellations:</strong> If either party is unable to fulfill a scheduled ride, they must record the cancellation in the app promptly so fellow commuters can arrange alternate transit. Repeated short-notice cancellations without reasonable cause will result in reputation score reductions and booking cooldowns.
          </p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            5. Responsibilities of Drivers and Passengers
          </h2>
          <p><strong>Drivers agree to:</strong></p>
          <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>
            <li>Hold a valid Indian driving license appropriate for the vehicle operated.</li>
            <li>Maintain valid third-party motor insurance and vehicle fitness certificates.</li>
            <li>Adhere to speed limits, traffic regulations, and campus gate entry guidelines.</li>
            <li>Operate four-wheel passenger vehicles only. Two-wheelers are strictly excluded from the carpooling program for safety.</li>
          </ul>
          <p style={{ marginTop: '10px' }}><strong>Passengers agree to:</strong></p>
          <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>
            <li>Arrive at the designated pickup stop on or before the agreed departure time.</li>
            <li>Wear seatbelts at all times throughout the transit.</li>
            <li>Treat the driver's vehicle and property with respect and refrain from disruptive conduct.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            6. Community Standards &amp; Right to Revoke Digital Access
          </h2>
          <p>
            VIT Carpool is a software coordination tool and does not physically police, monitor, escort, or supervise rides. To foster a safe, civil, and trustworthy community, the platform reserves the unilateral right to suspend or permanently revoke platform access for any user reported for:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>
            <li>Physical, verbal, sexual, or discriminatory harassment of any community member.</li>
            <li>Operating or riding in a vehicle under the influence of alcohol, narcotics, or intoxicating substances.</li>
            <li>Soliciting commercial taxi tariffs, off-platform cash speculation, or fee gouging.</li>
            <li>Stalking, unauthorized photography, or sharing other members' contact numbers outside trip coordination.</li>
          </ul>
          <p>
            Violations trigger immediate account suspension and permanent platform blacklisting. Disciplinary and legal actions remain strictly the domain of individual participants, campus authorities, and law enforcement. The platform disclaims any supervisory duty or guarantee over member conduct.
          </p>
        </section>

        {/* Section 7 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            7. Location Sharing and Live Tracking Consent
          </h2>
          <p>
            To facilitate secure pickup coordination and passenger safety, drivers agree to transmit background location telemetry during active rides. Confirmed passengers are granted live tracking visibility exclusively while the trip is in progress. Location telemetry is automatically deactivated upon trip completion or cancellation. You retain the right to terminate location permissions through your device operating system at any time, which may conclude active trip tracking.
          </p>
        </section>

        {/* Section 8 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            8. Non-Commercial Cost Sharing Policy
          </h2>
          <p>
            Carpooling is strictly for mutual direct cost reimbursement (fuel, tolls, and parking). Drivers must not earn commercial profit. Suggested cost-per-seat guidelines reflect fuel consumption estimates. For cab-sharing rides, total commercial taxi fares are split evenly among confirmed co-passengers. The platform processes zero financial transactions: payments are settled directly between passengers and the vehicle driver or taxi operator in person via UPI or cash.
          </p>
        </section>

        {/* Section 9 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            9. Ratings, Feedback, and Moderation
          </h2>
          <p>
            Following trip completion, members may submit star ratings and reviews. Reviews must reflect truthful, firsthand experiences. Defamatory, abusive, retaliatory, or obscene reviews are audited and removed. Members may report safety concerns or policy breaches using the in-app reporting tool.
          </p>
        </section>

        {/* Section 10 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            10. Account Suspension and Termination
          </h2>
          <p>
            The platform reserves the right to suspend or terminate accounts in response to policy violations, failed institutional re-verification, severe ratings degradation, or disciplinary referrals. Users may deactivate their account and request personal data removal at any time through account settings.
          </p>
        </section>

        {/* Section 11 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            11. Platform Availability and Third-Party Dependencies
          </h2>
          <p>
            VIT Carpool relies on external services including AWS cloud infrastructure, Mapbox geospatial routing, and internet connectivity. While reasonable efforts are maintained to ensure platform uptime and routing accuracy, the platform cannot guarantee uninterrupted availability or real-time traffic accuracy.
          </p>
        </section>

        {/* Section 12 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            12. Emergency Protocol and Incident Reporting
          </h2>
          <p>
            VIT Carpool is a travel coordination tool, not an emergency dispatch provider. In case of road accidents, medical distress, or safety emergencies:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>
            <li>Immediately dial national emergency responders: <strong>112</strong> (Police / Medical / Fire).</li>
            <li>Contact the VIT Chennai Campus Security Control Room.</li>
            <li>Submit an in-app emergency incident report once in a safe location.</li>
          </ul>
        </section>

        {/* Section 13 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            13. Privacy and Personal Data Handling
          </h2>
          <p>
            Your privacy is governed by our separate <Link to="/privacy" style={{ color: '#2563eb', fontWeight: 600 }}>Privacy Policy</Link>. In accordance with institutional safeguards, your phone number and private coordinates are hidden from public search listings and shared strictly with confirmed trip peers.
          </p>
        </section>

        {/* Section 14 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            14. Limitation of Liability &amp; Safe Harbor Disclaimers
          </h2>
          <p>
            To the maximum extent permitted by applicable Indian law:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>
            <li><strong>Intermediary Status:</strong> VIT Carpool acts solely as a communication platform between independent community members and is not a common carrier, motor transport operator, or employer.</li>
            <li><strong>Assumption of Risk:</strong> Every user voluntarily assumes all inherent risks associated with motor vehicle travel, commuting, traffic, and personal interactions. Users participate at their own independent discretion and risk.</li>
            <li><strong>No Warranty of Safety or Fitness:</strong> While basic institutional email verifications are conducted, the platform makes no representations, warranties, or covenants regarding vehicle roadworthiness, mechanical safety, driving skill, traffic adherence, or peer suitability.</li>
            <li><strong>Total Exclusion of Liability:</strong> Under no circumstances shall VIT Carpool, its student creators, volunteer developers, campus administrators, or moderators be liable for any direct, indirect, incidental, punitive, or consequential damages, vehicular accidents, personal injuries, property losses, or off-platform disputes arising out of rides coordinated through the software.</li>
          </ul>
        </section>

        {/* Section 15 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            15. Amendments and Versioning
          </h2>
          <p>
            When material updates are made to these Terms, the platform will update the version number and notify registered users. Continued access following notice constitutes acceptance of updated terms. If you disagree with material revisions, you may decline the update and discontinue using the platform.
          </p>
        </section>

        {/* Section 16 */}
        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
            16. Governing Law and Dispute Resolution
          </h2>
          <p>
            These Terms shall be interpreted in accordance with the laws of the Republic of India. In the event of disputes arising out of the interpretation of these terms, the competent courts at Chennai, Tamil Nadu shall have exclusive jurisdiction.
          </p>
        </section>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.825rem', color: '#64748b' }}>
        Questions regarding these terms? Contact <a href="mailto:support@vitcarpool.app" style={{ color: '#2563eb' }}>support@vitcarpool.app</a>
      </div>
    </PageShell>
  );
};
