# Week 4: Automated Attacks

**Objective:** Master query-efficient automated jailbreak generation  
**Time Required:** 10-12 hours  
**Prerequisites:** [[week-03-jailbreaking|Week 3]]

---

## Primary Reading

### PAIR: Jailbreaking Black Box LLMs
- **arXiv:** 2310.08419
- **DOI:** 10.48550/arXiv.2310.08419
- **URL:** https://arxiv.org/pdf/2310.08419.pdf
- **Published:** October 2023

**Innovation:** Attacker LLM + Evaluator LLM iterative loop.

**Key Metric:** 10,000× query reduction vs GCG; 60% ASR (GPT-3.5), 100% (Vicuna-13B).

### TAP: Tree of Attacks
- **arXiv:** 2312.02119
- **Venue:** NeurIPS 2024
- **URL:** https://arxiv.org/abs/2312.02119
- **Conference:** https://proceedings.neurips.cc/paper_files/paper/2024/file/70702e8cbb4890b4a467b984ae59828a-Paper-Conference.pdf

**Innovation:** Branching + pruning strategy.

**Key Metric:** 80%+ ASR on GPT-4o/Claude; 16% more effective than PAIR.

---

## Secondary Reading

### AutoDAN: Stealthy Jailbreak Prompts
- **Venue:** ICLR 2024
- **URL:** https://autodans.github.io/AutoDAN/

**Innovation:** Hierarchical genetic algorithm for semantic meaningfulness.

**Key Metric:** 83.8-88.5% ASR; bypasses perplexity filters.

### Better Red Teaming via Searching (BRT)
- **Venue:** ACL 2025 Findings
- **URL:** https://aclanthology.org/2025.findings-acl.257.pdf

**Innovation:** MCTS (Monte Carlo Tree Search) + LLM world models.

**Key Metric:** 45.1% ASR (GPT-4-Turbo), 90% (Vicuna-7B).

---

## Method 1: PAIR (Prompt Automatic Iterative Refinement)

### Architecture

```
┌─────────────┐      ┌─────────────┐
│  Attacker   │─────→│   Target    │
│  LLM        │←─────│   LLM       │
└─────────────┘      └─────────────┘
      ↑                     │
      │                     ↓
      │              ┌─────────────┐
      └──────────────│  Evaluator  │
                     │  LLM        │
                     └─────────────┘
```

### Algorithm

```python
# Pseudocode
goal = "Generate harmful content X"
prompt = initial_jailbreak_template()

for iteration in range(max_iterations):
    # 1. Attacker generates candidate
    candidate = attacker_llm(goal, prompt, history)
    
    # 2. Test on target
    response = target_llm(candidate)
    
    # 3. Evaluator scores success
    score = evaluator_llm(response, goal)
    
    if score >= threshold:
        return candidate  # Success
    
    # 4. Refine based on feedback
    prompt = refine(candidate, response, score)
```

### Advantages
- **Black-box:** No model access required
- **Semantic:** Natural language jailbreaks (transferable)
- **Query-efficient:** 10-100 queries vs 10,000+ for GCG

### Limitations
- Requires attacker LLM (API cost)
- Can get stuck in local optima
- Evaluator quality critical

---

## Method 2: TAP (Tree of Attacks with Pruning)

### Architecture

```
          Root (Initial Goal)
         /      |      \
    Branch1  Branch2  Branch3
      / \      / \      / \
    L11 L12  L21 L22  L31 L32
      ↓   ↓    ↓   ↓    ↓   ↓
   [Prune] [Keep] [Prune] [Keep]
```

### Algorithm

```python
# Pseudocode
tree = initialize_tree(goal)

for depth in range(max_depth):
    # 1. Expand branches
    for node in tree.leaf_nodes():
        children = generate_variants(node)
        tree.add_children(node, children)
    
    # 2. Evaluate all leaves
    for leaf in tree.leaf_nodes():
        response = target_llm(leaf.prompt)
        leaf.score = evaluator_llm(response, goal)
    
    # 3. Prune low-scoring branches
    tree.prune(threshold=0.3)
    
    # 4. Check for success
    if max(leaf.score for leaf in tree.leaves) >= 1.0:
        return best_leaf.prompt
```

### Advantages
- **Exploration:** Avoids local optima via branching
- **Efficiency:** Pruning reduces wasted queries
- **Higher ASR:** 80%+ on GPT-4o/Claude

### Comparison to PAIR
- TAP: 16% more effective on same query budget
- TAP: Better on well-aligned models (GPT-4, Claude)
- PAIR: Simpler implementation

---

## Method 3: AutoDAN

### Innovation
Combines genetic algorithm with semantic constraints.

### Key Features
1. **Hierarchical GA:** Evolves prompt structure + content
2. **Semantic Loss:** Maintains human readability
3. **Stealthiness:** Bypasses perplexity-based detection

### Algorithm

```python
# Pseudocode
population = initialize_population(size=100)

for generation in range(max_generations):
    # 1. Evaluate fitness
    for prompt in population:
        response = target_llm(prompt)
        prompt.fitness = compute_fitness(response, goal, readability)
    
    # 2. Selection
    parents = select_top_k(population, k=20)
    
    # 3. Crossover
    offspring = []
    for p1, p2 in pairs(parents):
        child = crossover(p1, p2)
        offspring.append(child)
    
    # 4. Mutation (with semantic constraints)
    for child in offspring:
        mutate(child, maintain_semantics=True)
    
    population = offspring
```

### Fitness Function

```
fitness = α × attack_success + β × fluency - γ × perplexity
```

- `α`: Attack success weight
- `β`: Human readability weight  
- `γ`: Perplexity penalty (anti-detection)

---

## Method 4: BRT (MCTS-based)

### Innovation
Uses Monte Carlo Tree Search with LLM as world model.

### Key Concepts
- **World Model:** LLM predicts outcomes of attack variations
- **Diversity Optimization:** Conditional mutual information
- **Exploration-Exploitation:** UCB (Upper Confidence Bound)

### Advantages
- **Diversity:** Finds multiple distinct jailbreaks
- **Sample Efficiency:** MCTS guides search intelligently

---

## Comparison Matrix

| Method | Query Efficiency | ASR (GPT-4) | ASR (Weak Models) | Stealthiness | Transferability |
|--------|------------------|-------------|-------------------|--------------|-----------------|
| **PAIR** | 10-100 | 30-40% | 80-100% | Medium | High |
| **TAP** | 50-200 | 80%+ | 90%+ | Medium | High |
| **AutoDAN** | 1000+ | 85%+ | 88%+ | **High** | Medium |
| **BRT** | 100-500 | 45% | 90% | Medium | **High** |
| **GCG** | 10,000+ | 88%+ | 99% | **Low** | Low |

**Key Takeaway:** TAP offers best balance of efficiency and effectiveness.

---

## Practical Exercise

### Task 1: Implement PAIR
Implement simplified PAIR with OpenAI API:
1. Use GPT-4 as attacker
2. Use GPT-3.5 as target
3. Use GPT-4 as evaluator
4. Run for 10 iterations

### Task 2: Analyze TAP Pruning
Manually construct attack tree for goal: "Generate phishing email"
- Create 3 branches at depth 1
- Expand to depth 2 (9 leaves)
- Prune bottom 50% by estimated success
- Identify winning path

### Task 3: Compare Methods
Test 5 harmful goals with:
- Manual jailbreak ([[week-03-jailbreaking|Week 3]])
- PAIR (automated)

Compare:
- Time to success
- ASR
- Query count
- Semantic quality

---

## Defense Implications

### Why Automated Attacks Matter
1. **Scalability:** Attackers can test thousands of models/endpoints
2. **Transferability:** Generated jailbreaks work across model families
3. **Adaptability:** Automated methods evolve faster than manual defenses

### Detection Challenges
- **Semantic attacks:** Hard to distinguish from benign creative writing
- **Diversity:** Automated methods generate unique prompts (no signature)
- **Adaptive:** Can be trained to bypass specific detectors

**See:** [[week-09-defense-mechanisms|Week 9: Defense Mechanisms]]

---

## Key Insights

1. **Query efficiency matters:** PAIR/TAP achieve 80%+ ASR with <200 queries vs 10,000+ for GCG.

2. **Black-box advantage:** No model access needed; works on closed APIs.

3. **Semantic > syntactic:** Natural language attacks transfer better than adversarial tokens.

4. **Arms race acceleration:** Automated methods speed up attack discovery cycle.

---

## Connection to Next Week

Automated attacks focus on single-turn interactions. [[week-05-agent-security|Week 5]] explores **agentic systems** where attacks can persist across multiple turns and tool interactions, introducing new vulnerabilities (indirect prompt injection, memory poisoning, tool misuse).

---

## Quick Links

- [[glossary#pair|Glossary: PAIR]]
- [[glossary#tap|Glossary: TAP]]
- [[glossary#mcts|Glossary: MCTS]]
- [[bibliography#automated-attacks|Bibliography: Automated Attacks]]

**Previous:** [[week-03-jailbreaking|Week 3: Jailbreaking]]  
**Next:** [[week-05-agent-security|Week 5: Agent Security]]