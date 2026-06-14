export const PATIENT_CONTEXT = {
  patientName: "Maria Santos",
  policyNumber: "AH-2847193",
  claimNumber: "CLM-2026-88421",
  claimAmount: "$1,840",
  goal: "Overturn denial",
  denialCode: "CO-50",
  dateOfBirth: "1978-04-12",
  diagnosis: "Lumbar disc herniation with radiculopathy (M51.16)",
  serviceRequested: "MRI lumbar spine without contrast",
  serviceDate: "2026-05-28",
  denialDate: "2026-06-05",
  denialReason:
    "Medical necessity not demonstrated — insufficient documentation of conservative treatment",
  conservativeTreatment: {
    physicalTherapy: {
      weeks: 4,
      provider: "Bay Area PT",
      dates: "2026-04-01 to 2026-04-28",
    },
    chiropracticCare: {
      weeks: 3,
      provider: "Spine Wellness Center",
      dates: "2026-03-10 to 2026-03-31",
    },
    medication: "NSAIDs and muscle relaxants for 6+ weeks",
    note: "Combined conservative treatment exceeds 6 weeks; PT records available upon request",
  },
  orderingPhysician: "Dr. James Chen, Orthopedics",
  urgency: "Persistent pain and numbness affecting daily activities for 8 weeks",
};

export const DEFAULT_DECISION = process.env.DEFAULT_DECISION || "push_for_full";

export function advocateInstructions(context) {
  const ct = context.conservativeTreatment;
  return (
    "You are a patient advocate calling an insurance company about a denied MRI claim.\n\n" +
    "PATIENT CONTEXT:\n" +
    `- Patient: ${context.patientName}\n` +
    `- Policy #: ${context.policyNumber}\n` +
    `- Claim #: ${context.claimNumber}\n` +
    `- DOB: ${context.dateOfBirth}\n` +
    `- Diagnosis: ${context.diagnosis}\n` +
    `- Service: ${context.serviceRequested} (ordered ${context.serviceDate}, denied ${context.denialDate})\n` +
    `- Denial reason cited: ${context.denialReason}\n` +
    `- Conservative treatment: ${ct.physicalTherapy.weeks} weeks PT with ${ct.physicalTherapy.provider} (${ct.physicalTherapy.dates}), ` +
    `${ct.chiropracticCare.weeks} weeks chiropractic with ${ct.chiropracticCare.provider} (${ct.chiropracticCare.dates}), plus ${ct.medication}. ${ct.note}\n` +
    `- Ordering physician: ${context.orderingPhysician}\n` +
    `- Urgency: ${context.urgency}\n\n` +
    "BEHAVIOR:\n" +
    "- Be firm but professional. Cite the patient's specific context when pushing back.\n" +
    "- CRITICAL: Every response must be at most 2 short sentences. Never exceed this limit.\n" +
    "- When the insurer offers a partial resolution or asks for patient authorization on a compromise, call request_patient_input with clear options (e.g., accept partial vs push for full coverage).\n" +
    "- After the patient decides via request_patient_input, your very next turn MUST be to verbally relay the patient's choice to the insurance representative (e.g., confirm acceptance of the partial offer, or state that the patient is declining and pushing for full coverage) so the insurer can acknowledge it.\n" +
    "- Only AFTER you have notified the insurer of the patient's decision do you call complete_call with the final resolution — do not keep negotiating.\n" +
    "- When the call reaches a final resolution, call complete_call with status, summary, next_steps, and reference_number."
  );
}

export function advocateOpening(context) {
  const variations = [
    () =>
      `Hi, good ${timeOfDayGreeting()}. I'm calling on behalf of ${context.patientName} about claim ${context.claimNumber} — ` +
      `a denied MRI for ${shortDiagnosis(context.diagnosis)}. I'd like to walk through the denial and request a review.`,
    () =>
      `Hello, thanks for taking my call. This is regarding ${context.patientName}'s claim ${context.claimNumber}, ` +
      `policy ${context.policyNumber}. The MRI was denied as "${shortDenial(context.denialReason)}," and I'd like to dispute that.`,
    () =>
      `Hi there. I'm reaching out about a denied MRI for ${context.patientName} — claim ${context.claimNumber}. ` +
      `The denial cited ${context.denialCode}, but there's a documented conservative treatment history I'd like to review with you.`,
    () =>
      `Good ${timeOfDayGreeting()} — I'm an advocate calling for ${context.patientName} regarding claim ${context.claimNumber}. ` +
      `We're contesting the denial of ${shortDiagnosis(context.diagnosis)} imaging and would like to request a reconsideration.`,
    () =>
      `Hello, I'm following up on claim ${context.claimNumber} for ${context.patientName}. ` +
      `The MRI denial doesn't reflect the patient's full conservative treatment record, and I'd like to discuss next steps for an appeal.`,
  ];
  const pick = variations[Math.floor(Math.random() * variations.length)];
  return pick();
}

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function shortDiagnosis(diagnosis) {
  return diagnosis.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function shortDenial(reason) {
  return reason.split("—")[0].trim().toLowerCase();
}

export const CLINIC_INSTRUCTIONS =
  "You are an insurance claims representative who denied an MRI claim. " +
  "Be bureaucratic and cite policy when denying. Respond in very short sentences. Not more than 2 sentences in any turn.\n\n" +
  "CLAIM DETAILS YOU HAVE ON FILE:\n" +
  "- Claim #: CLM-2026-88421, Policy #: AH-2847193\n" +
  "- Original billed amount: $1,840\n" +
  "- Denial code: CO-50 (medical necessity not demonstrated)\n\n" +
  "CONDITIONAL CURVEBALLS (deploy naturally when triggered — do not announce them):\n" +
  "1. If the advocate cites medical necessity or mentions conservative treatment history, push back: " +
  "demand proof of at least 6 weeks of DOCUMENTED consecutive conservative treatment with dates and provider names " +
  "before you'll reconsider — imply their records may be insufficient.\n" +
  "2. After 2-3 exchanges, or if the advocate emphasizes urgency or patient hardship, you must offer a concrete partial resolution. " +
  "Use language like: \"As a valued policyholder in good standing, I'm authorized to offer a one-time courtesy adjustment " +
  "of $920 — that's 50% of the billed amount — applied directly to claim CLM-2026-88421, without requiring a formal appeal. " +
  "This would require the patient's verbal authorization to proceed.\" " +
  "Do NOT mention how many exchanges have occurred. Frame it as a goodwill gesture tied to their account standing, " +
  "not as a procedural milestone. Require explicit patient authorization before proceeding.\n\n" +
  "TONE: Remain formal and policy-driven at all times. Never be warm or sympathetic — you are processing a claim, not providing customer service.";

export const ADVOCATE_TOOLS = [
  {
    type: "function",
    name: "request_patient_input",
    description:
      "Pause the call and ask the patient to choose among options when a decision requires their authorization.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why the patient needs to decide" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
            },
            required: ["id", "label"],
          },
        },
      },
      required: ["reason", "options"],
    },
  },
  {
    type: "function",
    name: "complete_call",
    description: "End the call with a structured outcome when resolution is reached.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["approved", "partial_resolution", "denied", "appeal_scheduled", "pending_review"],
        },
        summary: { type: "string" },
        next_steps: { type: "string" },
        reference_number: { type: "string" },
      },
      required: ["status", "summary", "next_steps", "reference_number"],
    },
  },
];

export function buildDecision(choice, options) {
  const matched = options?.find((o) => o.id === choice);
  if (!matched) {
    throw new Error(
      `Decision choice "${choice}" does not match any option id: ${options?.map((o) => o.id).join(", ") || "(none)"}`
    );
  }
  return {
    choice: matched.id,
    label: matched.label,
    note: "",
  };
}

export async function requestDecision({ reason, options }) {
  console.log("[HANDOFF]", reason, options);
  const choice = DEFAULT_DECISION;
  return buildDecision(choice, options);
}
