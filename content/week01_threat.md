# Week 1: Threat Landscape

**Objective:** Understand the complete taxonomy of LLM security threats  
**Time Required:** 8-10 hours  
**Prerequisites:** None

---

## Primary Reading

### Security Concerns for Large Language Models: A Survey
- **arXiv:** 2505.18889
- **DOI:** 10.48550/arXiv.2505.18889
- **URL:** https://arxiv.org/abs/2505.18889
- **Published:** May 2025

**Why Critical:** Most comprehensive 2025 taxonomy covering all attack surfaces.

**Key Sections:**
1. Training-time vulnerabilities (poisoning, backdoors)
2. Inference-time vulnerabilities (prompt injection, adversarial inputs)
3. Autonomous agent risks (goal misalignment, deception)
4. Defense mechanisms overview

---

## Secondary Reading

### LLM Security: Vulnerabilities, Attacks, Defenses
- **arXiv:** 2505.01177
- **URL:** https://arxiv.org/abs/2505.01177
- **Published:** May 2025

**Focus:** Training-phase vs inference-phase distinction, defense taxonomy.

---

## Core Concepts

### Four Threat Categories

#### 1. [[prompt-injection|Prompt Injection]]
Manipulation of model behavior through crafted inputs.
- Direct injection (user-controlled)
- Indirect injection (external content)
- Context confusion attacks

#### 2. [[adversarial-attacks|Adversarial Attacks]]
Perturbations causing misclassification or harmful outputs.
- White-box (gradient-based)
- Black-box (query-based)
- Transfer attacks

#### 3. [[data-poisoning|Data Poisoning]]
Malicious training data causing backdoors or biases.
- Backdoor triggers
- Availability poisoning
- Targeted misclassification

#### 4. Agent Risks
Autonomous systems with tool access.
- Goal misalignment
- Excessive agency
- Deceptive behavior

---

## OWASP LLM Top 10 (2025)

### Critical Threats
1. **LLM01:** [[prompt-injection|Prompt Injection]]
2. **LLM02:** Insecure Output Handling
3. **LLM03:** [[data-poisoning|Training Data Poisoning]]
4. **LLM04:** Model Denial of Service
5. **LLM05:** Supply Chain Vulnerabilities
6. **LLM06:** Sensitive Information Disclosure
7. **LLM07:** Insecure Plugin Design
8. **LLM08:** Excessive Agency
9. **LLM09:** Overreliance
10. **LLM10:** [[model-extraction|Model Theft]]

**Full Reference:** [[owasp-llm-top-10|OWASP LLM Top 10]]

---

## Attack Surface Analysis

### Training Phase
```
Data Collection → Preprocessing → Training → Fine-tuning
     ↓               ↓              ↓            ↓
  Poisoning      Backdoor      Weight      Alignment
  Attacks        Injection     Tampering   Bypassing
```

### Inference Phase
```
User Input → Prompt Processing → Model Inference → Output
    ↓              ↓                   ↓             ↓
 Direct       Context             Adversarial    Output
 Injection    Confusion           Perturbation   Leakage
```

---

## Key Metrics

### Attack Success Rate (ASR)
Percentage of attacks achieving intended malicious goal.

**Formula:**
```
ASR = (Successful Attacks / Total Attempts) × 100%
```

**Typical Ranges:**
- Strong defenses: < 10% ASR
- Baseline models: 60-80% ASR
- Advanced attacks: > 90% ASR

### False Positive Rate (FPR)
Legitimate inputs incorrectly flagged as attacks.

**Defense Trade-off:**
```
High Security (Low ASR) ↔ Usability (Low FPR)
```

---

## Practical Exercise

### Task 1: Threat Classification
Read 10 attack examples from HarmBench and classify them into OWASP categories.

### Task 2: Attack Surface Mapping
For a hypothetical RAG system (retrieval + LLM + tools), identify:
1. 3 training-time vulnerabilities
2. 5 inference-time vulnerabilities
3. 2 system-level risks

---

## Connection to Next Week

Understanding the threat landscape is incomplete without knowing **why** these threats exist. [[week-02-alignment-mechanisms|Week 2]] covers alignment mechanisms (RLHF, Constitutional AI, DPO) that attempt to prevent these attacks—and why they often fail.

---

## Quick Links

- [[owasp-llm-top-10|OWASP Standards]]
- [[glossary#asr|Glossary: ASR]]
- [[bibliography#surveys|Bibliography: Surveys]]

**Next:** [[week-02-alignment-mechanisms|Week 2: Alignment Mechanisms]]