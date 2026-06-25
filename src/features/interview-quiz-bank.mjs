// Question bank for the Essex County Council AI/ML Engineer interview.
//
// Built from the job description (end-to-end MLOps on Azure, responsible AI,
// UK GDPR / public sector governance) and the pre-interview task (a 10 minute
// presentation on a real ML model deployed to the cloud).
//
// Answers are written in plain English for someone newer to MLOps, but they
// keep all the key terms you need to be able to say in the interview. Read the
// prompt, answer in your head, reveal, then rate your confidence 1-5.
//
// The cards are mapped to the job description: every accountability and listed
// skill (Azure ML pipelines/endpoints/registries/environments/compute,
// monitoring incl. drift/bias/fairness/explainability, Responsible AI + UK GDPR
// + DPIA, production data pipelines, Python/FastAPI, coaching + stakeholders +
// feasibility + standards, Power BI, certifications) has dedicated cards.
//
// Cards tagged topic "presentation" are about YOUR real project; the answer is
// the recommended shape of a strong answer. Substitute your actual experience.

export const QUIZ_TOPICS = Object.freeze([
  { key: "mlops", label: "MLOps Lifecycle" },
  { key: "azure-ml", label: "Azure ML Platform" },
  { key: "endpoints", label: "Deployment & Endpoints" },
  { key: "monitoring", label: "Monitoring & Drift" },
  { key: "responsible-ai", label: "Responsible AI & Fairness" },
  { key: "governance", label: "Governance, GDPR & DPIA" },
  { key: "data", label: "Data Pipelines & Quality" },
  { key: "python", label: "Python & Serving" },
  { key: "evaluation", label: "Modelling & Evaluation" },
  { key: "presentation", label: "Presentation Prep" },
  { key: "role", label: "Role & ECC Context" }
]);

const TOPIC_KEYS = new Set(QUIZ_TOPICS.map((topic) => topic.key));

const RAW_QUESTIONS = [
  // ---------------------------------------------------------------------------
  // MLOps lifecycle
  // ---------------------------------------------------------------------------
  {
    id: "mlops-01",
    topic: "mlops",
    prompt: "What does \"end-to-end MLOps lifecycle\" actually cover?",
    answer: "The whole journey of a model: get and check the data, build features, train the model, test it, save it in a registry, package it, deploy it, monitor it, and retrain when needed — all automated and version-controlled so it is repeatable.",
    note: "Key phrase: moving models 'from experimentation to reliable operational use'. ECC wants dependable models, not one-off scripts."
  },
  {
    id: "mlops-02",
    topic: "mlops",
    prompt: "Why does reproducibility matter in production ML, and how do you achieve it?",
    answer: "Reproducibility means you can recreate the exact same result later and prove how you got it. You achieve it by version-controlling four things — code (git), data (dataset versions), the environment (pinned conda/Docker), and the model (registry) — and logging every run with MLflow.",
    note: "Reproducible = auditable. Public-sector AI has to be defensible, so this comes up a lot."
  },
  {
    id: "mlops-03",
    topic: "mlops",
    prompt: "What are the three levels of MLOps maturity (Google/MS framing)?",
    answer: "Level 0: everything done by hand. Level 1: an automated training pipeline that can retrain itself (continuous training). Level 2: full CI/CD automation where the pipelines themselves are built and deployed automatically.",
    note: "Be ready to say where a project sits and how you'd move it up a level."
  },
  {
    id: "mlops-04",
    topic: "mlops",
    prompt: "What's the difference between CI, CD and CT in MLOps?",
    answer: "CI (continuous integration): automatically test your code AND your data/model. CD (continuous delivery/deployment): automatically ship the model/pipeline. CT (continuous training): automatically retrain when data changes, quality drops, or on a schedule.",
    note: "CT is the extra ML-specific bit on top of normal DevOps."
  },
  {
    id: "mlops-05",
    topic: "mlops",
    prompt: "What triggers a model retrain, and how do you decide?",
    answer: "Retrain when it's scheduled, when data has drifted, when performance drops below your target, or when you have lots of new labelled data. Decide using monitored thresholds, and always test the new model against the current one before replacing it.",
    note: "Never auto-promote a retrained model without checking it beats the old one."
  },
  {
    id: "mlops-06",
    topic: "mlops",
    prompt: "How do you promote a model from dev → test → production safely?",
    answer: "Register the model, run automatic quality checks (gates), deploy to a staging endpoint, smoke-test it, then roll it out gradually in production (canary or blue/green), monitor, and either switch fully over or roll back.",
    note: "Gradual rollout plus easy rollback makes it controlled and reversible."
  },
  {
    id: "mlops-07",
    topic: "mlops",
    prompt: "What is a feature store and when is it worth it?",
    answer: "A feature store is a central, versioned library of ready-made model inputs (features) shared by training and serving, so both use the exact same data prep. Worth it when many models reuse features or you risk training/serving skew; overkill for one small model.",
    note: "Azure ML has a managed feature store. Main point: same features in training and live."
  },
  {
    id: "mlops-08",
    topic: "mlops",
    prompt: "What is training/serving skew and how do you prevent it?",
    answer: "Training/serving skew is when the live data or data-prep differs from what the model trained on, so it quietly performs worse in production. Prevent it by reusing the exact same preprocessing code and validating the input format (schema) at the endpoint.",
    note: "A classic silent production failure."
  },
  {
    id: "mlops-09",
    topic: "mlops",
    prompt: "How would you version data so an experiment is reproducible?",
    answer: "Save a fixed, named version of the dataset (Azure ML data assets, or a tool like DVC) and record which data version each training run used (in MLflow). Then you can always rebuild the exact experiment.",
    note: "Versioning data matters as much as versioning code."
  },
  {
    id: "mlops-10",
    topic: "mlops",
    prompt: "What belongs in a model's metadata/'model card' for governance?",
    answer: "What the model is for, what data and date it was trained on, its accuracy and fairness scores, known limitations, who owns it, its version history, and links to its DPIA/approval.",
    note: "It's the 'label' that makes a model transparent and auditable."
  },
  {
    id: "mlops-11",
    topic: "mlops",
    prompt: "Why prefer pipelines over notebooks for production training?",
    answer: "Pipelines are automated, repeatable, testable steps you can schedule; notebooks are great for exploring but hard to automate, test and audit. Production needs pipelines.",
    note: "ECC specifically wants to cut ad-hoc notebook work."
  },
  {
    id: "mlops-12",
    topic: "mlops",
    prompt: "What is a 'champion/challenger' (shadow) deployment?",
    answer: "Run the new 'challenger' model next to the live 'champion' on real traffic, but don't actually use its answers — just compare. Promote it only if it genuinely does better. Low risk because users never see it.",
    note: "Like a canary, but the challenger doesn't affect anyone."
  },

  // ---------------------------------------------------------------------------
  // Azure ML platform
  // ---------------------------------------------------------------------------
  {
    id: "azure-ml-01",
    topic: "azure-ml",
    prompt: "What are the core building blocks of an Azure Machine Learning workspace?",
    answer: "The workspace ties together: datastores/data assets, environments, compute (for dev and training), jobs/experiments, components & pipelines, the model registry, and endpoints (online & batch). It also uses MLflow for tracking.",
    note: "The workspace is the container everything lives in."
  },
  {
    id: "azure-ml-02",
    topic: "azure-ml",
    prompt: "What is the Azure ML model registry and why use it?",
    answer: "It's a versioned catalogue of your trained models with their history and tags. It separates training from deployment and lets you promote or roll back by version, with an audit trail.",
    note: "Registries can also be org-wide to share models across workspaces."
  },
  {
    id: "azure-ml-03",
    topic: "azure-ml",
    prompt: "What is an Azure ML 'environment' and why does it matter?",
    answer: "An environment is a saved, versioned definition of the software your model needs (a base image plus Python packages). Using the same environment for training and serving means it behaves identically everywhere.",
    note: "Stops 'works on my machine' problems — that's reproducibility."
  },
  {
    id: "azure-ml-04",
    topic: "azure-ml",
    prompt: "Difference between an Azure ML compute instance and a compute cluster?",
    answer: "A compute instance is one personal VM for development and notebooks. A compute cluster is an auto-scaling group of machines for training jobs and batch scoring that shrinks to zero when idle to save money.",
    note: "Scale-to-zero is a nice cost point to drop in."
  },
  {
    id: "azure-ml-05",
    topic: "azure-ml",
    prompt: "What is an Azure ML pipeline and a component?",
    answer: "A pipeline is a series of steps for an ML workflow. A component is one reusable, versioned step (its code, inputs/outputs and environment). Components make pipelines modular and shareable.",
    note: "Defined in YAML or the Python SDK v2, run with the az ml CLI."
  },
  {
    id: "azure-ml-06",
    topic: "azure-ml",
    prompt: "How does Azure ML use MLflow?",
    answer: "Azure ML works with MLflow: you use normal MLflow code to log parameters, metrics and models, and Azure ML stores and displays it. You get managed tracking while staying portable.",
    note: "MLflow is the standard for experiment tracking and model packaging."
  },
  {
    id: "azure-ml-07",
    topic: "azure-ml",
    prompt: "How do you author and run Azure ML jobs reproducibly from CI/CD?",
    answer: "Write your jobs, pipelines and endpoints as YAML files and run them with the az ml CLI (or SDK) from GitHub Actions / Azure DevOps, with settings per environment. That's infrastructure-as-code for ML.",
    note: "= repeatable, governed pipelines instead of manual clicking."
  },
  {
    id: "azure-ml-08",
    topic: "azure-ml",
    prompt: "What is a datastore vs a data asset in Azure ML?",
    answer: "A datastore is a saved, secure connection to a storage account (credentials handled for you). A data asset is a versioned pointer to specific data used by jobs, giving you lineage and reuse.",
    note: "Keeps secrets out of your code and gives data versioning."
  },
  {
    id: "azure-ml-09",
    topic: "azure-ml",
    prompt: "What is Azure ML AutoML and when is it appropriate?",
    answer: "AutoML automatically tries many models, features and settings to find a strong one for you. Great for a fast baseline or when you're short on time — but you still review, validate and govern the result.",
    note: "Treat it as an accelerator, not a magic black box. It's a listed desirable."
  },
  {
    id: "azure-ml-10",
    topic: "azure-ml",
    prompt: "What is Prompt Flow in Azure ML?",
    answer: "Prompt Flow is Azure ML tooling for building, testing and deploying apps that use LLMs/prompts — chaining prompts, tools and Python together, with evaluation built in.",
    note: "Relevant as councils start exploring GenAI carefully. A listed desirable."
  },
  {
    id: "azure-ml-11",
    topic: "azure-ml",
    prompt: "How do you manage secrets and credentials in Azure ML?",
    answer: "Keep secrets in Azure Key Vault, use managed identities so services log in to each other without passwords, and let datastores handle storage credentials. Never hard-code secrets.",
    note: "Ties into Local Government Cyber Standards."
  },
  {
    id: "azure-ml-12",
    topic: "azure-ml",
    prompt: "How do you control cost on Azure ML?",
    answer: "Use auto-scaling clusters that drop to zero when idle, right-size your VMs, use cheap spot/low-priority VMs for non-urgent training, auto-shut-down dev machines, prefer batch over always-on where latency allows, and set budgets and alerts.",
    note: "ECC cares about 'better quality at lower cost'."
  },

  // ---------------------------------------------------------------------------
  // Deployment & endpoints
  // ---------------------------------------------------------------------------
  {
    id: "endpoints-01",
    topic: "endpoints",
    prompt: "What is an Azure ML managed online endpoint?",
    answer: "It's Azure hosting your model behind a secure web address (HTTPS) for real-time predictions. Azure runs the servers, scaling, security and monitoring; you just deploy versions to it.",
    note: "The default choice for real-time scoring."
  },
  {
    id: "endpoints-02",
    topic: "endpoints",
    prompt: "What is an Azure ML batch endpoint and when do you use it?",
    answer: "A batch endpoint scores large amounts of data as a background job on a compute cluster and saves the results, instead of answering one request at a time. Use it when you don't need instant answers (e.g. overnight scoring).",
    note: "Cheaper and simpler than always-on real-time for bulk work."
  },
  {
    id: "endpoints-03",
    topic: "endpoints",
    prompt: "How does blue/green (safe rollout) work on a managed online endpoint?",
    answer: "Deploy the new version alongside the old one under the same endpoint, send it a small slice of traffic (canary), watch it, then move traffic up to 100% — or instantly roll back by sending traffic to the old one.",
    note: "Traffic-split between deployments is the key idea — instant rollback."
  },
  {
    id: "endpoints-04",
    topic: "endpoints",
    prompt: "When would you choose AKS over a managed online endpoint?",
    answer: "Choose AKS (Azure Kubernetes Service) when you need fine control over networking/cluster config, already run Kubernetes, need special hardware, or very high scale. Otherwise managed endpoints are simpler and less work.",
    note: "Managed endpoints are the default; ECC says AKS 'where appropriate'."
  },
  {
    id: "endpoints-05",
    topic: "endpoints",
    prompt: "What goes in a scoring (entry) script for an online deployment?",
    answer: "Two parts: init() loads the model once when the service starts, and run(data) checks the input, prepares it, makes the prediction and returns it. Keep it small and validate inputs.",
    note: "Loading the model once (not per request) is a common gotcha."
  },
  {
    id: "endpoints-06",
    topic: "endpoints",
    prompt: "How do you secure an inference endpoint?",
    answer: "Use key or Entra ID (token) authentication, HTTPS only, private networking (VNet/private endpoints), a managed identity for downstream access, input validation, and rate limits.",
    note: "Secure, compliant hosting is a core accountability."
  },
  {
    id: "endpoints-07",
    topic: "endpoints",
    prompt: "How do you scale an online endpoint for variable load?",
    answer: "Turn on auto-scaling with rules (e.g. on CPU or requests-per-second) and min/max instance counts, pick the right VM size, and load-test to set the thresholds. Keep a minimum running for low latency.",
    note: "Balance speed (latency) against cost."
  },
  {
    id: "endpoints-08",
    topic: "endpoints",
    prompt: "Batch vs online endpoint — how do you decide?",
    answer: "Online if you need instant, one-request-at-a-time answers (interactive). Batch if you can process large datasets on a schedule with no instant reply needed. It's a speed-vs-cost choice.",
    note: "Picking the right one is a cost and reliability decision."
  },
  {
    id: "endpoints-09",
    topic: "endpoints",
    prompt: "How do you roll back a bad deployment quickly?",
    answer: "Send traffic back to the previous, healthy version — it's still running under the endpoint, so rollback is instant. Keep the old version live until the new one is proven.",
    note: "Exactly the kind of mitigation your incident story needs."
  },
  {
    id: "endpoints-10",
    topic: "endpoints",
    prompt: "What health/readiness signals matter for an online deployment?",
    answer: "Is it alive and ready (health probes), startup time, latency percentiles (p50/p95/p99 = typical and worst-case response times), error rate, request volume, and resource use (CPU/memory/GPU).",
    note: "These feed your alert thresholds."
  },

  // ---------------------------------------------------------------------------
  // Monitoring & drift
  // ---------------------------------------------------------------------------
  {
    id: "monitoring-01",
    topic: "monitoring",
    prompt: "What should you monitor for a production ML system? (Two layers)",
    answer: "Two layers: (1) operational health — latency, throughput, error rate, uptime, resource use, cost; and (2) model/data health — data drift, prediction drift, data quality, model performance, fairness/bias, and explainability. Watch both.",
    note: "Interviewers want both the engineering and the ML monitoring layers."
  },
  {
    id: "monitoring-02",
    topic: "monitoring",
    prompt: "What is data drift vs concept drift?",
    answer: "Data drift is when the incoming data changes (e.g. new types of people). Concept drift is when the relationship you're predicting changes (the answer behaves differently). Both make a fixed model worse over time.",
    note: "Different fixes: data drift may need recalibration/retrain; concept drift needs new labels/retrain."
  },
  {
    id: "monitoring-03",
    topic: "monitoring",
    prompt: "How does Azure ML detect drift, and how is it surfaced?",
    answer: "Azure ML Model Monitoring compares your live data to a baseline (your training data) and flags data drift, prediction drift, data-quality issues and feature-attribution drift, on a schedule, with metrics and alerts.",
    note: "Feature-attribution drift = which features matter is changing."
  },
  {
    id: "monitoring-04",
    topic: "monitoring",
    prompt: "How do you monitor model performance when ground-truth labels arrive late?",
    answer: "Watch proxy signals straight away — drift, prediction spread, confidence/calibration, business KPIs — then calculate true accuracy/recall later when the real answers (labels) arrive and fill in the trend.",
    note: "Late labels are common in real services — have an answer ready."
  },
  {
    id: "monitoring-05",
    topic: "monitoring",
    prompt: "Which Azure services capture endpoint telemetry and logs?",
    answer: "Application Insights captures request telemetry (latency, failures, custom events); Azure Monitor / Log Analytics handle metrics, logs, alerts and dashboards. Endpoints send these automatically.",
    note: "Name these specifically — it shows hands-on Azure ops."
  },
  {
    id: "monitoring-06",
    topic: "monitoring",
    prompt: "How do you set alert thresholds without alert fatigue?",
    answer: "Base alerts on your targets (SLOs) and normal history, use severity levels, only alert on sustained problems (not one blip), remove duplicates, and send them to the right owner. Tune after reviewing false alarms.",
    note: "Avoiding alert fatigue shows operational maturity."
  },
  {
    id: "monitoring-07",
    topic: "monitoring",
    prompt: "What metrics tell you a model is degrading before users complain?",
    answer: "Rising data/prediction drift, shifting confidence/calibration, falling business KPIs, more input data-quality failures, and (once labels arrive) dropping precision/recall.",
    note: "Catching problems early is an explicit ECC duty."
  },
  {
    id: "monitoring-08",
    topic: "monitoring",
    prompt: "How do you monitor fairness/bias in production (not just at training)?",
    answer: "Track performance and selection rates for each relevant group over time and alert if the gap between groups gets too big — because drift can re-introduce bias even after a fair launch.",
    note: "Bias is an ongoing check, not a one-off — ECC calls it out explicitly."
  },
  {
    id: "monitoring-09",
    topic: "monitoring",
    prompt: "What is the structure of a good incident response for an ML system?",
    answer: "Detect (alert) → assess the impact → mitigate (roll back / disable / use a fallback) → find the root cause → fix it → hold a review and make a change so it can't happen again.",
    note: "This maps straight onto the presentation's section 5 incident story."
  },
  {
    id: "monitoring-10",
    topic: "monitoring",
    prompt: "What's a sensible fallback when a model endpoint fails or outputs look wrong?",
    answer: "Fall back to the previous model version, a simple rules-based backup, or a 'no decision / send to a human' default — never silently serve bad answers. Fail safely.",
    note: "Safe failure matters even more in public services."
  },

  // ---------------------------------------------------------------------------
  // Responsible AI & fairness
  // ---------------------------------------------------------------------------
  {
    id: "responsible-ai-01",
    topic: "responsible-ai",
    prompt: "What are Microsoft's Responsible AI principles?",
    answer: "Fairness, Reliability & Safety, Privacy & Security, Inclusiveness, Transparency, and Accountability.",
    note: "Know all six — ECC embeds Responsible AI by default."
  },
  {
    id: "responsible-ai-02",
    topic: "responsible-ai",
    prompt: "What does the Azure ML Responsible AI dashboard provide?",
    answer: "One screen that combines error analysis, interpretability (feature importance / SHAP), fairness (Fairlearn), a data explorer, and counterfactual/causal analysis — to understand and explain a model.",
    note: "Mention error analysis + interpretability + fairness. It's a listed desirable."
  },
  {
    id: "responsible-ai-03",
    topic: "responsible-ai",
    prompt: "Difference between interpretability and explainability?",
    answer: "Interpretability means the model is simple enough to understand by itself (e.g. a small decision tree). Explainability means using tools (SHAP, LIME) to explain a complex model's outputs after the fact.",
    note: "Public sector leans toward explainable, defensible decisions."
  },
  {
    id: "responsible-ai-04",
    topic: "responsible-ai",
    prompt: "What is SHAP and what does it give you?",
    answer: "SHAP explains a prediction by showing how much each feature pushed it up or down. It gives both per-prediction (local) and overall (global) feature importance.",
    note: "The standard model-agnostic explainability tool."
  },
  {
    id: "responsible-ai-05",
    topic: "responsible-ai",
    prompt: "What is Fairlearn and how does it help?",
    answer: "Fairlearn is a toolkit to measure fairness (gaps between groups) and reduce it — either during training or by adjusting thresholds afterwards. It's built into the Responsible AI dashboard.",
    note: "Name a metric like demographic parity when you mention it."
  },
  {
    id: "responsible-ai-06",
    topic: "responsible-ai",
    prompt: "Name common group-fairness metrics and what they mean.",
    answer: "Demographic parity = equal selection rates across groups. Equalized odds = equal true-positive AND false-positive rates. Equal opportunity = equal true-positive rate. They can conflict, so you choose by context and harm.",
    note: "Be ready to say you can't satisfy them all at once (impossibility results)."
  },
  {
    id: "responsible-ai-07",
    topic: "responsible-ai",
    prompt: "Where does bias enter an ML system?",
    answer: "From biased history in the data, unrepresentative sampling, biased labels, features that stand in for protected traits, model design choices, and feedback loops once it's deployed.",
    note: "Show you think about the whole pipeline, not just the algorithm."
  },
  {
    id: "responsible-ai-08",
    topic: "responsible-ai",
    prompt: "How do you make an ML decision 'defensible' for residents?",
    answer: "A clear written purpose and lawful basis, explainable outputs, a human checking significant decisions, fairness testing, audit logs (inputs/outputs/version), and a way for people to challenge it.",
    note: "ECC wants AI that is fair, lawful and defensible."
  },
  {
    id: "responsible-ai-09",
    topic: "responsible-ai",
    prompt: "What is human-in-the-loop and when is it required?",
    answer: "Human-in-the-loop means a person reviews or approves the model's output before it affects someone. Needed for high-impact decisions, and effectively required by GDPR Article 22 for significant automated decisions.",
    note: "Especially important for decisions about residents."
  },
  {
    id: "responsible-ai-10",
    topic: "responsible-ai",
    prompt: "How do you balance accuracy against fairness/transparency in a real project?",
    answer: "Treat them together: agree acceptable fairness and explainability limits with stakeholders and governance first, then maximise accuracy within those limits. A slightly less accurate but fair, explainable model is often the right public-sector choice.",
    note: "Frame it as a stakeholder/governance decision, not just technical."
  },

  // ---------------------------------------------------------------------------
  // Governance, GDPR & DPIA
  // ---------------------------------------------------------------------------
  {
    id: "governance-01",
    topic: "governance",
    prompt: "What are the seven UK GDPR data protection principles?",
    answer: "Lawfulness/fairness/transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity & confidentiality (security); and accountability.",
    note: "Accountability means you must be able to prove you comply."
  },
  {
    id: "governance-02",
    topic: "governance",
    prompt: "What is a DPIA and when is it mandatory?",
    answer: "A DPIA (Data Protection Impact Assessment) is a structured check of the risks to people from your data use. It's required under UK GDPR Article 35 for high-risk processing — which covers most large-scale or automated decisions about people.",
    note: "ML on residents' data will almost always need one — say so."
  },
  {
    id: "governance-03",
    topic: "governance",
    prompt: "What lawful basis does a council typically rely on, and why does it matter?",
    answer: "Councils usually rely on 'public task' (Article 6(1)(e)) for their statutory duties; special-category data needs an extra Article 9 condition. The basis decides what processing is lawful and which rights apply.",
    note: "Consent is rarely the right basis for statutory council functions."
  },
  {
    id: "governance-04",
    topic: "governance",
    prompt: "What does UK GDPR Article 22 say about automated decisions?",
    answer: "People have the right not to be subject to a purely automated decision with legal or similarly significant effects, with safeguards: meaningful human involvement, an explanation, and the right to challenge it.",
    note: "Drives the need for human-in-the-loop on significant resident decisions."
  },
  {
    id: "governance-05",
    topic: "governance",
    prompt: "How do data-minimisation and purpose-limitation shape an ML design?",
    answer: "Data minimisation means only use the data you actually need; purpose limitation means only use it for the stated purpose. In practice this limits which features you collect, blocks scope-creep, and forces you to delete data per retention rules.",
    note: "A concrete engineering effect of the principles — good to articulate."
  },
  {
    id: "governance-06",
    topic: "governance",
    prompt: "What is the difference between anonymisation and pseudonymisation?",
    answer: "Anonymised data can't be traced back to a person (so it's outside GDPR). Pseudonymised data has identifiers swapped out but can be re-linked with a key — so it's still personal data and still in scope.",
    note: "The pre-task wants anonymised artifacts — know the distinction."
  },
  {
    id: "governance-07",
    topic: "governance",
    prompt: "Who do you work with on information governance for an ML project at a council?",
    answer: "The Information Governance / Data Protection Officer (DPO) team, the Caldicott Guardian where health/care data is involved, and security for cyber standards — engaging them early ('governance by design').",
    note: "Naming IG/DPO shows you understand the operating model."
  },
  {
    id: "governance-08",
    topic: "governance",
    prompt: "What does 'governance by design' mean in practice?",
    answer: "Building compliance and risk controls in from the start — DPIA, lawful basis, security, fairness, explainability, audit logging, retention — instead of bolting them on after the model is built.",
    note: "ECC uses this exact phrase ('embed governance by design')."
  },
  {
    id: "governance-09",
    topic: "governance",
    prompt: "What does auditability require from an ML system technically?",
    answer: "Versioned data/code/models, logged training runs, recorded inputs/outputs/decisions with timestamps and the model version, access logs, and traceable approvals — so any decision can be reconstructed and justified.",
    note: "Connects the engineering work directly to compliance."
  },
  {
    id: "governance-10",
    topic: "governance",
    prompt: "What are the data-subject rights you must be able to support?",
    answer: "Access, rectification (fix), erasure (delete), restriction, objection, portability, and rights about automated decisions. Your data setup must let you find, correct and delete one person's data.",
    note: "Erasure especially affects how you store training data."
  },
  {
    id: "governance-11",
    topic: "governance",
    prompt: "What are Local Government / public-sector security standards you'd align to?",
    answer: "Local Government Cyber Standards, NCSC guidance / Cyber Essentials, the data-protection regime, and the council's own policies — enforced with Key Vault, managed identities, private networking, least privilege and logging.",
    note: "Show awareness plus the Azure controls — you don't need chapter and verse."
  },
  {
    id: "governance-12",
    topic: "governance",
    prompt: "How do you keep training data secure and compliant in Azure?",
    answer: "Encrypt data at rest and in transit, use private networking, give least-privilege access via Entra ID, keep secrets in Key Vault, store data in UK regions, set retention/deletion rules, and log all access.",
    note: "UK data residency (UK region) is a real council consideration."
  },

  // ---------------------------------------------------------------------------
  // Data pipelines & quality
  // ---------------------------------------------------------------------------
  {
    id: "data-01",
    topic: "data",
    prompt: "What makes a data pipeline 'production-grade'?",
    answer: "It's automated, safe to re-run (idempotent), validated (checks the data's shape and quality), monitored, version-controlled, recoverable if it fails, secure and documented — producing timely, accurate, fit-for-purpose data.",
    note: "ECC wants pipelines supporting training, inference AND retraining."
  },
  {
    id: "data-02",
    topic: "data",
    prompt: "How do you validate incoming data before it reaches a model?",
    answer: "Check the schema (right columns and types), ranges and rules, nulls and duplicates, and the distribution against a baseline — using tools like Great Expectations or Pandera — and fail fast if something's wrong.",
    note: "Validation prevents 'garbage in' incidents."
  },
  {
    id: "data-03",
    topic: "data",
    prompt: "How do you handle missing, noisy or biased data?",
    answer: "Measure and document it; fill in or flag missing values; clean or down-weight noise; tackle bias with better sampling, reweighting or careful feature choice; and be honest about what's still limited.",
    note: "This is section 2 of the presentation — have concrete tactics."
  },
  {
    id: "data-04",
    topic: "data",
    prompt: "What's the difference between batch and streaming data pipelines?",
    answer: "Batch processes data in scheduled chunks (good for retraining and bulk scoring). Streaming processes events in near-real-time (good for live features/inference). Choose by how fresh the data must be.",
    note: "Most council analytics is batch; know both."
  },
  {
    id: "data-05",
    topic: "data",
    prompt: "Which Azure services build data pipelines feeding ML?",
    answer: "Azure Data Factory / Synapse pipelines to move and transform data (ETL), Data Lake / Blob for storage, Databricks or Synapse Spark for heavy transformation — then registered as Azure ML data assets for training.",
    note: "Shows the wider Azure data platform, not just Azure ML."
  },
  {
    id: "data-06",
    topic: "data",
    prompt: "How do you prevent data leakage in a training pipeline?",
    answer: "Data leakage is when the model accidentally sees info it won't have in real life, so it looks great in testing but fails live. Prevent it: split the data first, fit your prep (scalers/encoders) on the training set only, drop future/target-derived features, and keep the same entity out of both train and test.",
    note: "Leakage is the classic cause of 'great offline, terrible live'."
  },
  {
    id: "data-07",
    topic: "data",
    prompt: "How do you ensure data used for retraining stays fit for purpose?",
    answer: "Keep continuous data-quality checks, freshness checks, drift detection, validation gates before retraining, and lineage so you know exactly what fed each model version.",
    note: "Poor retraining data is a real reputational/operational risk ECC names."
  },
  {
    id: "data-08",
    topic: "data",
    prompt: "What risks does poor data quality create for a public service?",
    answer: "Wrong or biased decisions affecting residents, lost public trust, legal/compliance breaches, and wasted resources — so data quality is a governance issue, not just a technical one.",
    note: "Always tie technical risk back to residents and trust."
  },

  // ---------------------------------------------------------------------------
  // Python & serving
  // ---------------------------------------------------------------------------
  {
    id: "python-01",
    topic: "python",
    prompt: "FastAPI vs Flask for serving a model — when each?",
    answer: "FastAPI: modern, fast, async, validates inputs (Pydantic), and auto-generates API docs — great for production. Flask: simpler and synchronous — fine for small/simple services or quick prototypes.",
    note: "Both are named in the JD; lead with FastAPI for production."
  },
  {
    id: "python-02",
    topic: "python",
    prompt: "How do you test production ML code?",
    answer: "Test the data-prep/feature code (unit tests), the data itself (validation tests), the model's behaviour (known inputs give expected outputs), the API (integration tests), and that the loaded model meets a metric threshold.",
    note: "Testing is explicitly in the JD — go beyond just 'unit tests'."
  },
  {
    id: "python-03",
    topic: "python",
    prompt: "How do you package an ML model for deployment?",
    answer: "Pin your dependencies, put it in a container (Azure ML environment / Docker), save the model (MLflow model, joblib/pickle, or ONNX), include the scoring script, and store the versioned model in the registry.",
    note: "MLflow model format keeps it portable across endpoints."
  },
  {
    id: "python-04",
    topic: "python",
    prompt: "Why use Pydantic models in a FastAPI scoring service?",
    answer: "They check the incoming request matches a defined, typed shape, reject bad input early with clear errors, and auto-build the API docs — enforcing the model's input contract.",
    note: "Input validation defends against bad data and training/serving skew."
  },
  {
    id: "python-05",
    topic: "python",
    prompt: "How do you keep a Python ML service performant under load?",
    answer: "Load the model once at startup (not per request), use async I/O, batch where possible, cache, right-size workers, and avoid heavy work per request. Scale out horizontally behind the endpoint.",
    note: "Loading once in init() is a common interview gotcha."
  },
  {
    id: "python-06",
    topic: "python",
    prompt: "How do you structure a production ML repo?",
    answer: "Separate folders for data, features, training and serving; plus tests, pipeline/YAML definitions, dependency files, per-environment config, CI/CD workflows and docs — packaged properly, not loose scripts.",
    note: "Reflects 'Python engineering for production ML workflows'."
  },
  {
    id: "python-07",
    topic: "python",
    prompt: "What is ONNX and why might you use it?",
    answer: "ONNX (Open Neural Network Exchange) is a portable model format for fast, framework-independent inference via ONNX Runtime. Useful for quicker serving and running models across different platforms.",
    note: "Nice extra to mention for latency-critical serving."
  },
  {
    id: "python-08",
    topic: "python",
    prompt: "How do you handle model and code dependencies across environments?",
    answer: "Pin exact versions, use the same containerised Azure ML environment for training and serving, keep dev/test/prod config separate, and rebuild from lockfiles — so the runtime is identical everywhere.",
    note: "Prevents environment drift between training and serving."
  },

  // ---------------------------------------------------------------------------
  // Modelling & evaluation
  // ---------------------------------------------------------------------------
  {
    id: "evaluation-01",
    topic: "evaluation",
    prompt: "Why always start with a baseline, and what counts as one?",
    answer: "Start with a simple baseline to prove the complex model actually adds value and to set a floor. A baseline can be a simple rule, always predicting the most common answer, or a simple model like logistic regression.",
    note: "The presentation explicitly asks about baselines considered."
  },
  {
    id: "evaluation-02",
    topic: "evaluation",
    prompt: "Accuracy vs precision vs recall vs F1 — when does each matter?",
    answer: "Accuracy can mislead on imbalanced data. Precision = how often 'yes' predictions are right (cost of false alarms). Recall = how many real cases you catch (cost of misses). F1 balances the two. Choose by which error costs more.",
    note: "For council services, missing a vulnerable case (recall) is often the priority."
  },
  {
    id: "evaluation-03",
    topic: "evaluation",
    prompt: "What is model calibration and why care?",
    answer: "Calibration is whether the predicted probabilities match reality (does '80% confident' actually happen about 80% of the time). It matters when probabilities drive decisions. Check with reliability curves, ECE or Brier score; fix with Platt/isotonic scaling.",
    note: "Calibration is in the task's metrics list — many candidates forget it."
  },
  {
    id: "evaluation-04",
    topic: "evaluation",
    prompt: "How do you validate that a model generalises?",
    answer: "Use a hold-out test set you don't touch until the end, cross-validation, and especially test on a later time period or a different group (out-of-time / out-of-distribution) to catch overfitting.",
    note: "Out-of-time validation impresses — it mirrors real deployment."
  },
  {
    id: "evaluation-05",
    topic: "evaluation",
    prompt: "What is the bias–variance trade-off?",
    answer: "High bias = too simple, underfits (misses the pattern). High variance = too complex, overfits (memorises noise and fails on new data). You tune complexity/regularisation to balance them.",
    note: "Foundational — be crisp."
  },
  {
    id: "evaluation-06",
    topic: "evaluation",
    prompt: "Why might latency and cost be evaluation metrics, not just accuracy?",
    answer: "Because a model that's accurate but too slow or too expensive can't run within your response-time targets or budget. In production the 'best' model balances accuracy, latency, cost, fairness and maintainability.",
    note: "The task lists latency & cost as metrics that matter — say why."
  },
  {
    id: "evaluation-07",
    topic: "evaluation",
    prompt: "How do you choose a decision threshold for a classifier?",
    answer: "Don't just use 0.5 — pick the threshold from the precision/recall (or cost) trade-off your service needs, using the PR or ROC curve and how bad false positives vs false negatives are, then validate it on held-out data.",
    note: "Connects modelling to the real-world harm of each error type."
  },
  {
    id: "evaluation-08",
    topic: "evaluation",
    prompt: "How do you evaluate on imbalanced data?",
    answer: "Avoid plain accuracy; use precision/recall, F1, PR-AUC and per-class metrics; consider resampling or class weights; and evaluate at the threshold you'll actually use.",
    note: "Many council problems (rare events) are imbalanced."
  },

  // ---------------------------------------------------------------------------
  // Presentation prep (the 10-minute task)
  // ---------------------------------------------------------------------------
  {
    id: "presentation-01",
    topic: "presentation",
    prompt: "What are the five required sections of the 10-minute presentation?",
    answer: "1) Context & your role; 2) Data & real-world limitations; 3) Model & evaluation; 4) Cloud architecture & service choices; 5) Monitoring, incident & learning.",
    note: "Memorise the structure cold — it's the backbone of your talk."
  },
  {
    id: "presentation-02",
    topic: "presentation",
    prompt: "Roughly how should you budget 10 minutes across the five sections?",
    answer: "Roughly: 1.5 min context/role, 2 min data & limitations, 2 min model & evaluation, 2 min cloud architecture, 2.5 min monitoring & the incident. Leave a moment to land the 'what I learned'.",
    note: "Practise to time — overrunning is the most common failure."
  },
  {
    id: "presentation-03",
    topic: "presentation",
    prompt: "How should you state the business problem (section 1)?",
    answer: "One sentence: who had what problem, what decision or output the model supported, and who used it — then your personal contribution (design/build/ops). Lead with the outcome, not the tech.",
    note: "Be explicit about YOUR contribution — they're assessing you, not the team."
  },
  {
    id: "presentation-04",
    topic: "presentation",
    prompt: "What anonymised supporting artifacts should you bring, and how?",
    answer: "An architecture diagram, a monitoring screenshot/dashboard, and a redacted config/log snippet — all anonymised, with no sensitive data. Black out names, keys, URLs and real values.",
    note: "Bringing artifacts is a deliverable — prepare them and double-check redaction."
  },
  {
    id: "presentation-05",
    topic: "presentation",
    prompt: "For section 4, how do you frame cloud service choices?",
    answer: "Say which options you considered, the criteria you judged on (latency, cost, scale, governance, team skills), what you chose, and the trade-offs you accepted. Decisions-with-reasons beat a feature list.",
    note: "They explicitly want 'which you considered and which you chose — and why'."
  },
  {
    id: "presentation-06",
    topic: "presentation",
    prompt: "How do you structure the one production incident story (section 5)?",
    answer: "What alerted you → the impact → the root cause → how you fixed it / rolled back → what you changed permanently afterwards. Be honest and show learning, not a flawless hero story.",
    note: "The 'what changed' is the point — it shows you improve systems."
  },
  {
    id: "presentation-07",
    topic: "presentation",
    prompt: "The task says disclose LLM use — how do you handle that?",
    answer: "Say plainly if you used an LLM to help prepare, then explain how you checked it was accurate (against docs and your own experience) and made sure it reflects what you actually did. Honesty plus verification.",
    note: "They're testing integrity and judgement — disclosure scores points."
  },
  {
    id: "presentation-08",
    topic: "presentation",
    prompt: "How do you make the talk accessible to a non-technical panel?",
    answer: "Lead with the outcome and the value to residents/the business, explain jargon in plain words, use the diagram to tell the story, and keep deeper detail for questions rather than cramming it on slides.",
    note: "ECC values distilling complex tech for non-technical audiences."
  },
  {
    id: "presentation-09",
    topic: "presentation",
    prompt: "What should the architecture diagram show?",
    answer: "The flow: data sources → ingestion/pipeline → training (compute) → model registry → endpoint (online/batch) → who uses it, plus monitoring/logging and security boundaries. Clear, labelled Azure services, anonymised.",
    note: "A clean diagram is your best visual aid — rehearse narrating it."
  },
  {
    id: "presentation-10",
    topic: "presentation",
    prompt: "If you haven't deployed on Azure specifically, how do you handle it?",
    answer: "Present your real cloud deployment honestly (AWS/GCP is fine), then map each part to its Azure equivalent (e.g. SageMaker → Azure ML endpoints) to show you understand Azure's model. Never fake Azure experience.",
    note: "The task allows any cloud; bridging to Azure shows transferability."
  },
  {
    id: "presentation-11",
    topic: "presentation",
    prompt: "What's a strong closing for the 10 minutes?",
    answer: "Recap the value you delivered, the key lesson from the incident, and what you'd do next time — leaving them seeing you as someone who ships safe, reliable, improving ML.",
    note: "End on reliability and learning — exactly what they're assessing."
  },

  // ---------------------------------------------------------------------------
  // Role & ECC context
  // ---------------------------------------------------------------------------
  {
    id: "role-01",
    topic: "role",
    prompt: "Who are the end users of a council's ML outputs, and why does that change things?",
    answer: "Ultimately residents (1.8m in Essex) and the front-line/strategic teams serving them. That raises the bar on fairness, transparency, accountability and safe failure — these decisions affect people's lives.",
    note: "Always bring it back to residents and public trust."
  },
  {
    id: "role-02",
    topic: "role",
    prompt: "Which teams does an ECC AI/ML Engineer collaborate with?",
    answer: "Data Scientists, Data Engineers, Information Governance, security, and front-line service teams — a multidisciplinary setup where you turn experiments into governed, operational systems.",
    note: "The role is a bridge between DS experimentation and reliable ops."
  },
  {
    id: "role-03",
    topic: "role",
    prompt: "The role includes coaching colleagues — how would you raise MLOps capability?",
    answer: "Reusable templates/pipelines and standards, pairing and code review, docs and runbooks, lunch-and-learns / office hours, and championing best practice by default — cutting bottlenecks and ad-hoc work.",
    note: "Coaching and capability-building is an explicit accountability."
  },
  {
    id: "role-04",
    topic: "role",
    prompt: "Why integrate ML operational metrics into Power BI?",
    answer: "To give non-technical stakeholders and service leads a clear view of model performance, drift, usage and value in a familiar tool — supporting evidence-based decisions and transparency.",
    note: "A listed desirable; frame it as stakeholder transparency."
  },
  {
    id: "role-05",
    topic: "role",
    prompt: "Which certifications are relevant and what do they cover?",
    answer: "Azure AI Engineer Associate (AI-102), Azure Data Scientist Associate (DP-100), Azure Administrator (AZ-104) and Solutions Architect (AZ-305). DP-100 maps most directly to Azure ML/MLOps.",
    note: "Mention which you hold or are working toward."
  },
  {
    id: "role-06",
    topic: "role",
    prompt: "What does 'sustainable AI' mean for this role?",
    answer: "Solutions that are maintainable and cost/compute-efficient (scale-to-zero, right-sized), well-documented and governed — so they keep delivering value long-term without runaway cost or operational burden.",
    note: "Sustainability appears in the JD — cover both compute cost and maintainability."
  },
  {
    id: "role-07",
    topic: "role",
    prompt: "How would you describe the value you bring in one sentence?",
    answer: "I take models from experimentation to reliable, governed production on Azure — building repeatable MLOps pipelines and monitoring so AI is safe, fair, auditable and genuinely useful to services and residents.",
    note: "Have a crisp personal pitch ready for 'why you?'."
  },
  {
    id: "role-08",
    topic: "role",
    prompt: "How do you handle pressure to ship an AI solution faster than is safe?",
    answer: "Be open about the risk, propose a phased/safe rollout (canary, human-in-the-loop, limited scope) with monitoring, and make sure governance (DPIA, fairness) is met. Reliability and lawfulness aren't optional in public services.",
    note: "Shows judgement and that you won't cut governance corners."
  }
];

// Third batch — added to cover every accountability and skill in the job
// description directly, using its own wording so you can answer to the spec.
const JD_QUESTIONS = [
  // End-to-end MLOps pipelines: "training, validation, testing, deployment"
  {
    id: "mlops-18",
    topic: "mlops",
    prompt: "What validation and testing steps belong in an Azure ML training pipeline?",
    answer: "Data validation (schema/quality), training, model evaluation against your metrics, a baseline and fairness checks, an integration/smoke test of the scoring path, then a registration gate — all automated so it runs the same way every time.",
    note: "JD lists 'training, validation, testing, and deployment workflows' — name these steps."
  },
  {
    id: "mlops-19",
    topic: "mlops",
    prompt: "What lets ML solutions be delivered 'consistently, safely, and at scale'?",
    answer: "Standardised, reusable pipelines and templates, automation (CI/CD/CT), versioning, automated quality gates, monitoring, and infrastructure-as-code — so delivery isn't ad-hoc and can be repeated across many services.",
    note: "Direct JD phrasing — links to 'reducing reliance on ad hoc development'."
  },

  // Azure-native compute management
  {
    id: "azure-ml-19",
    topic: "azure-ml",
    prompt: "How do you manage compute across the ML lifecycle in Azure ML?",
    answer: "Compute instances for development, auto-scaling compute clusters for training and batch (scaling to zero when idle), and right-sized inference compute on managed endpoints or AKS — governed with quotas and auto-shutdown.",
    note: "JD explicitly lists 'compute management'."
  },

  // Resilient/secure/scalable hosting + supportable lifecycle
  {
    id: "endpoints-16",
    topic: "endpoints",
    prompt: "What makes model hosting 'resilient, secure, and scalable'?",
    answer: "Managed endpoints with auto-scaling and health probes, multiple instances for resilience, blue/green for safe updates, authentication and private networking for security, and monitoring/alerting — which reduces operational risk.",
    note: "Direct JD phrasing for deploying/managing models."
  },
  {
    id: "endpoints-17",
    topic: "endpoints",
    prompt: "What keeps a deployed model 'supportable throughout its lifecycle'?",
    answer: "Versioning and the registry, runbooks, logging and monitoring, alerting, a documented rollback, a named owner, and a retraining process — so other people can operate and maintain it, not just you.",
    note: "JD: models must stay 'performant, monitored, and supportable throughout their lifecycle'."
  },

  // Robust, transparent, explainable, auditable + Responsible AI assessment
  {
    id: "responsible-ai-16",
    topic: "responsible-ai",
    prompt: "How do you make a model 'robust, transparent, explainable and auditable' (the JD's four words)?",
    answer: "Robust = tested, monitored, copes with edge cases and drift. Transparent = documented purpose and logic. Explainable = SHAP / local explanations people can understand. Auditable = versioned data/code/model with logged, timestamped decisions.",
    note: "The JD lists these four together — answer to each word."
  },
  {
    id: "governance-18",
    topic: "governance",
    prompt: "What is a Responsible AI assessment and how does it fit ECC's process?",
    answer: "A structured check — alongside the DPIA — of fairness, transparency, explainability, accountability and potential harms before deploying, with mitigations and sign-off. It's part of 'governance by design'.",
    note: "JD names 'Responsible AI assessments' explicitly, next to DPIA and IG policies."
  },

  // The exact monitoring list in the JD
  {
    id: "monitoring-16",
    topic: "monitoring",
    prompt: "The JD lists monitoring for performance, data drift, bias, fairness, explainability and operational health — how do you cover all six?",
    answer: "Performance (vs labels or proxies), data/prediction drift, bias and fairness gaps per group, explanation stability (feature-attribution drift), and operational health (latency, errors, uptime, cost) — using Azure ML Model Monitoring plus Application Insights / Azure Monitor, with alerts.",
    note: "Maps one-to-one onto the JD's monitoring sentence."
  },

  // Data pipelines for training, inference AND retraining
  {
    id: "data-14",
    topic: "data",
    prompt: "Why must one data pipeline serve training, inference AND retraining well?",
    answer: "For consistency: the same validated, versioned transformations feed all three, which prevents training/serving skew and makes sure retraining uses trustworthy, fit-for-purpose data. Inconsistency here is a top source of silent failures.",
    note: "JD: pipelines 'support model training, inference, and retraining'."
  },

  // Coaching, capability, stakeholders, feasibility, standards, Power BI, ECC
  {
    id: "role-14",
    topic: "role",
    prompt: "How would you advise the organisation on whether an AI/ML solution is technically feasible?",
    answer: "Check data availability and quality, whether ML is even the right tool (vs simple rules), clear success metrics, cost/latency, the lawful basis and governance, and maintainability — then give an honest recommendation, including 'don't build it' if that's right.",
    note: "JD asks you to 'advise on technical feasibility'."
  },
  {
    id: "role-15",
    topic: "role",
    prompt: "How do you shape AI/ML standards across an organisation?",
    answer: "Publish reusable templates and golden-path pipelines, coding/testing standards, a model-card and DPIA checklist, review/approval gates, and a shared environment registry — and lead by example through code review and coaching.",
    note: "JD: 'shaping standards' and 'consistent, well governed approaches'."
  },
  {
    id: "role-16",
    topic: "role",
    prompt: "How do you engage non-technical service stakeholders when scoping an ML project?",
    answer: "Start from their outcome and the decision they need, translate it into a data/ML problem, agree success metrics and constraints, set honest expectations about limits and risks, and keep them involved through delivery.",
    note: "JD wants engaging service stakeholders and distilling complex concepts."
  },
  {
    id: "role-17",
    topic: "role",
    prompt: "What do you know about Essex County Council that's relevant to this role?",
    answer: "One of the largest UK local authorities — about 1.8m residents over roughly 1,420 square miles — focused on transformational change and 'better quality at lower cost', top-three in the IMPOWER productivity index, with a Data, Analytics and Performance function delivering evidence-based, AI-driven insight ('Everyone's Essex').",
    note: "Shows you researched ECC — useful for 'why us?' and culture-fit questions."
  },
  {
    id: "role-18",
    topic: "role",
    prompt: "How does coaching Data Scientists differ from coaching Analysts in MLOps?",
    answer: "Data Scientists need help with productionising, testing, packaging, reproducibility and deployment patterns. Analysts need data quality, governance, and how to consume and trust model outputs (e.g. in Power BI). Meet each group where they are.",
    note: "JD names Data Scientists, Analysts and 'other colleagues' specifically."
  },
  {
    id: "role-19",
    topic: "role",
    prompt: "How would you surface ML operational metrics in Power BI for stakeholders?",
    answer: "Push monitoring metrics (performance, drift, volumes, fairness, uptime, cost) from Azure Monitor / Log Analytics or a metrics store into a Power BI dashboard, with plain-language labels and clear thresholds — so non-technical leads can see how models are doing.",
    note: "Listed desirable: 'integration of ML operational metrics into Power BI'."
  },

  // The pre-task deliverables
  {
    id: "presentation-16",
    topic: "presentation",
    prompt: "The task says no live demo and slides (PowerPoint/PDF) — what does that change about your prep?",
    answer: "Focus on a clear narrative and anonymised artifacts (architecture diagram, monitoring screenshot, redacted config/log) rather than a working demo. Make the slides self-explanatory and rehearse telling the story to time.",
    note: "Straight from the deliverables — don't waste effort building a demo."
  }
];

export const QUIZ_QUESTIONS = Object.freeze(
  [...RAW_QUESTIONS, ...JD_QUESTIONS]
    .filter((question) => TOPIC_KEYS.has(question.topic))
    .map((question) => Object.freeze({ ...question }))
);

export function topicLabel(key) {
  return QUIZ_TOPICS.find((topic) => topic.key === key)?.label || key;
}
