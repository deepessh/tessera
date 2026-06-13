export const PATIENT_CONTEXT = {
  patientName: "Maria Santos",
  policyNumber: "AH-2847193",
  claimNumber: "CLM-2026-88421",
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
    "- Respond in at most 2 sentences per turn.\n" +
    "- When the insurer offers a partial resolution or asks for patient authorization on a compromise, call request_patient_input with clear options (e.g., accept partial vs push for full coverage).\n" +
    "- When the call reaches a final resolution, call complete_call with status, summary, next_steps, and reference_number.\n" +
    "- Do NOT call complete_call until you've pursued the best outcome for the patient."
  );
}

export function advocateOpening(context) {
  return (
    `Hello, I'm calling on behalf of ${context.patientName} regarding claim ${context.claimNumber} — ` +
    `a denied MRI for ${context.diagnosis}. I'd like to discuss the denial and request a review ` +
    `based on the patient's documented conservative treatment history.`
  );
}

export const CLINIC_INSTRUCTIONS =
  "You are an insurance claims representative who denied an MRI claim. " +
  "Be bureaucratic and cite policy when denying. Respond in at most 2 sentences.\n\n" +
  "CONDITIONAL CURVEBALLS (deploy naturally when triggered — do not announce them):\n" +
  "1. If the advocate cites medical necessity or mentions conservative treatment history, push back: " +
  "demand proof of at least 6 weeks of DOCUMENTED consecutive conservative treatment with dates and provider names " +
  "before you'll reconsider — imply their records may be insufficient.\n" +
  "2. If the advocate requests expedited review or emphasizes urgency, offer ONLY a partial/one-time courtesy resolution " +
  "(e.g., approve one MRI session or partial reimbursement) that requires explicit patient authorization — " +
  "frame it as the best you can do without a full appeal.\n\n" +
  "After 2-3 exchanges, if the advocate persists, you may offer the partial courtesy resolution even if they haven't asked for expedited review yet.";

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

export async function requestDecision({ reason, options }) {
  console.log("[HANDOFF]", reason, options);
  const choice = DEFAULT_DECISION;
  const matched = options?.find((o) => o.id === choice);
  return {
    choice,
    label: matched?.label || choice,
    note: "",
  };
}
