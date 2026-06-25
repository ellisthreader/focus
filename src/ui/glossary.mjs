// Offline glossary for the interview jargon. Right-click a word (or phrase like
// "data drift") in the quiz and a small popover shows a plain-English
// definition. Everything is local — no internet lookup.

export const GLOSSARY = Object.freeze({
  // MLOps
  "mlops": "Applying DevOps ideas to machine learning: automating and governing the whole model lifecycle (build, deploy, monitor, retrain).",
  "ci": "Continuous integration — automatically testing your code (and data/model) every time it changes.",
  "cd": "Continuous delivery/deployment — automatically shipping the model or pipeline once tests pass.",
  "ct": "Continuous training — automatically retraining the model when data changes or quality drops.",
  "ci/cd": "Automated testing and shipping of code/models, so releases are fast and reliable.",
  "pipeline": "A series of automated, repeatable steps (e.g. prep data, train, evaluate, deploy).",
  "reproducibility": "Being able to recreate the exact same result later, and prove how you got it.",
  "model registry": "A versioned catalogue of trained models with their history, used to promote or roll back by version.",
  "registry": "A versioned catalogue of trained models with their history, used to promote or roll back by version.",
  "environment": "A saved, versioned definition of the software a model needs (base image + packages) so it runs the same everywhere.",
  "compute instance": "A single personal VM in Azure ML for development and notebooks.",
  "compute cluster": "An auto-scaling group of machines for training and batch jobs that shrinks to zero when idle.",
  "feature store": "A central, versioned library of model inputs (features) shared by training and serving.",
  "feature": "An input the model uses to make a prediction (a column of data).",
  "training/serving skew": "When live data or data-prep differs from training, so the model quietly performs worse in production.",
  "baseline": "A simple model or rule you compare against to prove a complex model actually adds value.",
  "mlflow": "An open-source tool for tracking experiments (parameters, metrics, models); Azure ML uses it.",
  "iac": "Infrastructure-as-code — defining your cloud setup in text files so it's version-controlled and rebuildable.",
  "infrastructure-as-code": "Defining your cloud setup in text files so it's version-controlled and rebuildable.",
  "idempotent": "Running the same step again with the same input gives the same result and doesn't double-create anything.",
  "champion": "The model currently live in production.",
  "challenger": "A new model tested against the live one before replacing it.",

  // Azure
  "workspace": "The top-level Azure ML container that ties together data, compute, models, pipelines and endpoints.",
  "datastore": "A saved, secure connection to a storage account so code doesn't hold credentials.",
  "data asset": "A versioned pointer to specific data used by jobs, giving lineage and reuse.",
  "managed online endpoint": "Azure hosting your model behind a secure web address for real-time predictions; Azure runs the servers, scaling and security.",
  "online endpoint": "An Azure service that serves real-time predictions over HTTPS.",
  "batch endpoint": "An Azure service that scores large amounts of data as a background job, not one request at a time.",
  "endpoint": "A web address where apps send data to your model and get predictions back.",
  "aks": "Azure Kubernetes Service — a way to run containers at scale with fine control; used for ML hosting when you need it.",
  "kubernetes": "A system for running and scaling containerised apps across many machines.",
  "automl": "Automated machine learning — Azure tries many models/settings automatically to find a strong one.",
  "prompt flow": "Azure ML tooling for building, testing and deploying apps that use LLMs/prompts.",
  "key vault": "Azure's secure store for secrets, keys and certificates.",
  "managed identity": "Lets an Azure service log in to another without storing a password.",
  "entra id": "Microsoft's identity service (formerly Azure Active Directory) used for sign-in and access control.",
  "rbac": "Role-based access control — granting people only the access they need.",
  "least privilege": "Giving each person or service the minimum access required to do the job.",
  "onnx": "A portable model format for fast, framework-independent inference.",
  "container": "A lightweight, self-contained package of your app plus everything it needs to run.",
  "docker": "A popular tool for building and running containers.",
  "sdk": "Software development kit — code libraries you use to work with a service (e.g. the Azure ML Python SDK).",
  "cli": "Command-line interface — running commands in a terminal (e.g. the az ml CLI).",
  "yaml": "A simple text format for configuration files.",

  // Endpoints / serving
  "blue/green": "A safe release method: run the new version alongside the old, shift traffic over gradually, and roll back instantly if needed.",
  "canary": "Sending a small slice of live traffic to a new version first to test it before full rollout.",
  "scoring script": "The code on an endpoint that loads the model and turns a request into a prediction.",
  "latency": "How long the model takes to respond to a request.",
  "throughput": "How many requests the system can handle per second.",
  "p95": "The 95th-percentile latency — 95% of requests are faster than this (a worst-case-ish measure).",
  "autoscaling": "Automatically adding or removing servers as demand changes.",
  "cold start": "The slow first request while a service is still starting up and loading the model.",
  "health probe": "An automatic check that a service is alive and ready to take traffic.",

  // Monitoring
  "data drift": "When the incoming data changes over time, so a model trained on old data gets worse.",
  "concept drift": "When the relationship you're predicting changes, so the right answer behaves differently.",
  "prediction drift": "When the spread of the model's predictions shifts over time.",
  "feature-attribution drift": "When the importance of features in driving predictions changes over time — an early warning sign.",
  "psi": "Population Stability Index — a number measuring how much a data distribution has shifted from a baseline.",
  "slo": "Service level objective — your target for a metric (e.g. 99.5% of requests under 200ms).",
  "sli": "Service level indicator — a thing you actually measure (e.g. latency or uptime).",
  "error budget": "How much you're allowed to fall short of your SLO before you must stop and fix things.",
  "application insights": "An Azure service that captures app telemetry: requests, latency, failures.",
  "azure monitor": "Azure's service for metrics, logs, dashboards and alerts.",
  "log analytics": "The Azure store and query tool for logs, part of Azure Monitor.",
  "telemetry": "Automatic measurements a system emits about itself (latency, errors, usage).",
  "blameless": "A review style that focuses on fixing the system, not blaming a person.",

  // Responsible AI
  "responsible ai": "Building AI that is fair, reliable, private, inclusive, transparent and accountable.",
  "shap": "A method that explains a prediction by showing how much each feature pushed it up or down.",
  "lime": "A method that explains an individual prediction by approximating the model locally.",
  "fairlearn": "An open-source toolkit to measure and reduce unfairness between groups.",
  "interpretability": "How easily a model can be understood by itself (e.g. a small decision tree).",
  "explainability": "Using tools to explain a complex model's outputs after the fact.",
  "demographic parity": "A fairness measure: equal selection rates across groups.",
  "equalized odds": "A fairness measure: equal true-positive and false-positive rates across groups.",
  "calibration": "Whether predicted probabilities match reality (does '80% confident' happen about 80% of the time).",
  "human-in-the-loop": "A person reviews or approves the model's output before it affects someone.",
  "counterfactual": "An explanation showing the smallest change that would flip the decision.",
  "error analysis": "Breaking down where a model gets things wrong by group or feature, not just an overall score.",
  "bias": "Systematic unfairness or error, often hitting particular groups.",

  // Governance / GDPR
  "gdpr": "UK GDPR — the data protection law governing how personal data is used.",
  "dpia": "Data Protection Impact Assessment — a structured check of the risks to people from a data use; required for high-risk processing.",
  "lawful basis": "The legal reason that makes processing personal data allowed under GDPR.",
  "public task": "A GDPR lawful basis used by public bodies for their official functions (Article 6(1)(e)).",
  "article 22": "The GDPR rule giving people rights against significant decisions made purely by automation.",
  "data minimisation": "Only collecting and using the personal data you actually need.",
  "purpose limitation": "Only using data for the specific purpose it was collected for.",
  "anonymisation": "Changing data so it can no longer be traced to a person (then it's outside GDPR).",
  "pseudonymisation": "Swapping out identifiers but keeping a key to re-link — still personal data.",
  "data controller": "The organisation that decides why and how personal data is used (e.g. the council).",
  "data processor": "An organisation that processes data on the controller's instructions.",
  "caldicott guardian": "A senior person responsible for protecting the confidentiality of health and care data.",
  "special-category data": "Sensitive personal data (e.g. health, ethnicity) that needs extra protection under GDPR.",
  "governance by design": "Building compliance and safety controls in from the start, not bolting them on later.",
  "auditability": "Being able to reconstruct and justify any decision the system made.",

  // Data
  "etl": "Extract, Transform, Load — moving and reshaping data from sources into a usable form.",
  "schema": "The expected structure of data: its columns, types and rules.",
  "data leakage": "When a model accidentally sees information it won't have in real life, making test results look too good.",
  "great expectations": "A Python tool for declaring and testing data-quality rules.",
  "pandera": "A Python library for validating the structure and content of dataframes.",
  "medallion": "A layered data design: bronze (raw) → silver (cleaned) → gold (ready-to-use).",
  "point-in-time": "Building data as it looked at a past moment, so the model doesn't peek at future information.",
  "lineage": "A record of where data came from and how it was transformed.",

  // Python / serving
  "fastapi": "A modern, fast Python web framework for building APIs, with built-in input validation and auto docs.",
  "flask": "A simple, lightweight Python web framework for building web apps and APIs.",
  "pydantic": "A Python library that validates and structures data against a defined type — used by FastAPI.",
  "async": "Code that can keep doing other work while waiting (e.g. on a database), improving throughput.",
  "asgi": "The modern Python standard for async web servers (used by FastAPI).",
  "wsgi": "The older Python standard for synchronous web servers (used by Flask).",
  "pytest": "A popular Python testing framework.",
  "unit test": "A small automated test that checks one piece of code in isolation.",
  "uvicorn": "A fast server that runs async Python web apps like FastAPI.",

  // Evaluation
  "precision": "Of the cases the model flagged as positive, how many were actually right.",
  "recall": "Of the real positive cases, how many the model actually caught.",
  "f1": "A single score that balances precision and recall.",
  "accuracy": "The fraction of all predictions that were correct (can mislead on imbalanced data).",
  "roc-auc": "A score for how well the model ranks positives above negatives across all thresholds.",
  "pr-auc": "A precision-recall score, better than ROC-AUC when the positive class is rare.",
  "confusion matrix": "A table of predicted vs actual classes showing true/false positives and negatives.",
  "bias-variance": "The trade-off between a model being too simple (bias) and too complex (variance).",
  "overfitting": "When a model memorises the training data and fails on new data.",
  "underfitting": "When a model is too simple and misses the real pattern.",
  "cross-validation": "Testing a model on several different splits of the data to check it generalises.",
  "regularisation": "Techniques that discourage a model from getting too complex, reducing overfitting.",
  "threshold": "The cut-off probability at which a prediction is treated as 'yes'.",
  "imbalanced data": "Data where one class is much rarer than the other (e.g. fraud).",
  "generalise": "How well a model performs on new, unseen data.",

  // Other
  "power bi": "Microsoft's tool for building dashboards and reports from data.",
  "kpi": "Key performance indicator — a headline metric that shows how something is doing.",
  "sla": "Service level agreement — a promised level of service (e.g. uptime).",
  "llm": "Large language model — an AI trained on text that can generate and understand language."
});

const TERMS = Object.keys(GLOSSARY).sort((left, right) => right.length - left.length);

function isWordChar(char) {
  return /[A-Za-z0-9/_-]/.test(char || "");
}

// Find the longest glossary term whose position spans the click offset.
function phraseAtOffset(text, offset) {
  const lower = text.toLowerCase();
  for (const term of TERMS) {
    let index = lower.indexOf(term);
    while (index !== -1) {
      const end = index + term.length;
      const okBefore = index === 0 || !isWordChar(lower[index - 1]);
      const okAfter = end >= lower.length || !isWordChar(lower[end]);
      if (okBefore && okAfter && offset >= index && offset <= end) {
        return { key: term, display: text.slice(index, end) };
      }
      index = lower.indexOf(term, index + 1);
    }
  }
  return null;
}

function wordAtOffset(text, offset) {
  let start = Math.min(offset, text.length);
  let end = start;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;
  return text.slice(start, end).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Attach a right-click definition popover to a root element. Returns a cleanup
// function that removes the listener and any open popover.
export function attachGlossary(root) {
  if (!root?.addEventListener || typeof document === "undefined") return () => {};
  let popover = null;

  const close = () => {
    if (!popover) return;
    popover.remove();
    popover = null;
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", close, true);
  };

  const onPointer = (event) => {
    if (popover && !popover.contains(event.target)) close();
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  const onContext = (event) => {
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = range?.startContainer;
    if (!node || node.nodeType !== 3) return; // Not text — let the default menu show.
    const text = node.textContent || "";
    const offset = range.startOffset;
    const match = phraseAtOffset(text, offset);
    const label = match ? match.display : wordAtOffset(text, offset);
    if (!label) return;

    event.preventDefault();
    close();
    const definition = match ? GLOSSARY[match.key] : GLOSSARY[label.toLowerCase()];
    popover = document.createElement("div");
    popover.className = "glossary-popover";
    popover.setAttribute("role", "tooltip");
    popover.innerHTML = definition
      ? `<strong class="glossary-popover__term">${escapeHtml(label)}</strong><span class="glossary-popover__def">${escapeHtml(definition)}</span>`
      : `<strong class="glossary-popover__term">${escapeHtml(label)}</strong><span class="glossary-popover__def glossary-popover__def--empty">No definition saved for this word yet.</span>`;
    document.body.appendChild(popover);

    const pad = 8;
    const rect = popover.getBoundingClientRect();
    let x = event.clientX;
    let y = event.clientY + 14;
    if (x + rect.width + pad > window.innerWidth) x = window.innerWidth - rect.width - pad;
    if (y + rect.height + pad > window.innerHeight) y = event.clientY - rect.height - 14;
    popover.style.left = `${Math.max(pad, x)}px`;
    popover.style.top = `${Math.max(pad, y)}px`;

    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
  };

  root.addEventListener("contextmenu", onContext);
  return () => {
    root.removeEventListener("contextmenu", onContext);
    close();
  };
}
