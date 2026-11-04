
My team investigated two separate questions:
1) Can we reconfigure learned index structures, e.g. ALEX, to store dynamic sparse graph data structures?
2) If possible, are there any advantages learned indices exhibit for dynamic graph insertion or graph traversal operations over standard Compressed Sparse Row-based structures? If not, what can we learn?


# Background
Learned indices are data structures that use machine learning models to predict the position of data using keys as input. The fundamental idea is that an index is a function from keys to positions, and if you can learn that function, you can replace tree traversal with a model prediction plus a small local correction. 

- Recursive Model Index was the first to show this principle worked but it only operated on static, read-only data. 
- ALEX made it practical for dynamic workloads by adding gapped arrays for cheap inserts and a cost model for self-tuning (fanout, splitting, merging nodes, etc).

There are other learned indices out there, an example being Piece-wise Linear models e.g. FITing-Tree. However none exhibited the level of throughput in dynamic write-read queries nor the sophisticated dynamic insertion logic that ALEX did at the time. 

ALEX has great advantages in lookups and insertions for KV workloads. The original ALEX paper has specific metrics: [ALEX: An Updatable Adaptive Learned Index](https://dl.acm.org/doi/epdf/10.1145/3318464.3389711). Our mentor had prior worked on optimizing graph storage in data structure, specifically [VCSR](https://webpages.charlotte.edu/ddai/data/dong-ccgrid-22.pdf), so naturally he wanted to see if this newly proposed data storage solution could improve upon it.  

In the original RMI paper: [The Case for Learned Index Structures](https://arxiv.org/pdf/1712.01208), Kraska posited that if a model can learn the sort order of values well enough, you can replace chasing a bunch of pointers down a tree with one simple inference call + a 'last mile' range query to correct any residual errors. 

Specifically, if a model can learn the empirical CDF (Cumulative Distribution Function) of all key values stored, then you can effectively use that as a functioning index. We would represent the querying within this index as:

$$\text{position} = \text{CDF}(\text{key}) \times N$$

During bulk loading, ALEX fits linear models that map keys to predicted positions within a node’s local key range. These models approximate the local data distribution and ALEX, using a cost model, adapts by splitting nodes more aggressively in regions where the distribution is irregular. 

During query time, the root node computes a(key) + b, the linear function already approximated after loading. It then passes the result down to the appropriate child node which then uses its linear function, based on its range of the CDF curve, to approximate location of the key. It continues on this path until reaching a leaf node, in the form of a gapped array, where finally the model will perform a local exponential search to quickly find the position of the key. 

Insertion uses the same logic to predict where to store the key. The model will try to fill the key in an appropriate gap. If there's no gap then it will shift elements in the array. If the array is too full, the index will trigger a split to divide the node in two. 

The result is that the ALEX paper reports up to 4.1× higher throughput than B+ trees across read-write workloads while never performing worse, and up to 2000× smaller index size on those workloads.


# Translation
Dynamic graphs are far different than key-value workloads. These structures are a collection of nodes, filled with data and edges to connect one another. In order to translate these structures into a workload we could test ALEX on, we created graph-supported versions of ALEX and STX B+ Tree. 

STX B+ Tree was a state-of-the-art tree model used for KV storage (now replaced by TLX). This was our baseline we wanted to compare against the CSR-style structures to see if there really was any advantage to the unique properties of learned indices. 

We forked both structures and implemented functions before loading where each graph edge being inputted were translated to a single KV entry. This allowed us to keep the core functionality of both data structures, minimizing code changes. We implemented these changes in C++. 

We encoded both source and destination vertices of an edge, *(u, v)*, to a single 64-bit integer as our key. We then stored a 64-bit timestamp and randomly generated 32-bit weight as the value to each key.

```
key   = (uint64_t(u) << 32) | uint64_t(v)
value = std::pair<uint64_t, uint32_t>
```

This encoding orders edges by the source vertex `u`, then by destination `v`. Each source ID gets its own block of $2^{32}$ possible keys, so there can be large gaps between populated blocks. How those keys are distributed depends on the vertex IDs and where the edges fall. A graph's edges-per-node ratio alone doesn't tell us how well ALEX can model that distribution. I'll return to this distinction in the later sections.

| Dataset          | Nodes         | Edges         | Edges/Node | Diameter | Avg Clustering |
| ---------------- | ------------- | ------------- | ---------- | -------- | -------------- |
| Orkut            | 3,072,441     | 117,185,083   | 38.14      | 9        | 0.167          |
| LiveJournal      | 3,997,962     | 34,681,189    | 8.67       | 17       | 0.284          |
| Cit-Patents      | 3,774,768     | 16,518,948    | 4.38       | 22       | 0.076          |
| as-Skitter       | 1,696,415     | 11,095,298    | 6.54       | 25       | 0.258          |
| Amazon           | 334,863       | 925,872       | 2.76       | 44       | 0.397          |
| StackOverflow    | 2,601,977     | 63,497,050    | 24.40      | -        | -              |
| **Road**         | **1,965,206** | **2,766,607** | **1.41**   | **849**  | **0.046**      |
| **MathOverflow** | **24,818**    | **506,550**   | **20.41**  | -        | -              |
| Enron            | 36,692        | 183,831       | 5.01       | 11       | 0.497          |

Road stands out in this table with a diameter of 849 and only 1.41 edges per node. MathOverflow is quite different: it has fewer vertices, but 20.41 edges per node, compared to Amazon's 2.76. These describe the graphs' connectivity. To see the distribution ALEX actually has to model, we need to look at the encoded keys.

We compared CDF approximation for graph and KV workloads closely; the empirical distributions for our graph datasets appear in Figure 1.

<div class="post-figure-grid">
<img src="writing/artifacts/amazon_ecdf.png" alt="Amazon: empirical CDF of edge keys" loading="lazy" />
<img src="writing/artifacts/orkut_ecdf.png" alt="Orkut: empirical CDF of edge keys" loading="lazy" />
<img src="writing/artifacts/mathoverflow_ecdf.png" alt="MathOverflow: empirical CDF of edge keys" loading="lazy" />
<img src="writing/artifacts/road_ecdf.png" alt="Road: empirical CDF of edge keys" loading="lazy" />
</div>

Figure 1: CDF of bitwise-concatenated edge keys across four datasets

Amazon and Orkut show relatively smooth distributions at this scale. MathOverflow's CDF rises sharply near the start of the plotted range, while Road's looks almost linear. MathOverflow's shape gives us a reason to investigate uneven key spacing and outliers, but the plot alone doesn't tell us how many times ALEX split a node or how deep the tree became. Road is a useful reminder of the same limitation: a smooth global CDF doesn't tell us the cost of traversing the graph.

The [ALEX authors describe highly nonlinear local distributions and extreme outlier keys as known limitations](https://github.com/microsoft/ALEX#limitations-and-future-research-directions). Those are possible explanations to test against our results, rather than something we can establish just by looking at these curves.

We'll return to these complications from Road and MathOverflow in the results.

# Experimentation
On the KV side, we benchmarked ALEX against STX (the traditional B+ tree baseline) across common learned-index workloads and parameter sweeps, including dataset-specific runs and repeated experiments.

On the graph side, we benchmarked ALEX_Graph and STX_Graph (our forked variations), and then compared those results against SOTA dynamic graph data structures like VCSR, PCSR, BAL, and CSR. 

For the dynamic graph aspect, we used an update-heavy loading plan: bulk loading an initial 10% of the graph, then dynamically insert the rest, stressing the update paths rather than letting the structure work off a complete, static build.

Note: Bulk loading refers to presorting a portion of data and inserting into a DB or tree based index in order to build up the tree in a 'bottom-up' sort of way to form the basic structure of the tree, speeding up performance for subsequent singular updates

For graph algorithms, we implemented the following kernels:
- PageRank (fixed iterations)
- Single Source Shortest Path
- Breadth First Search
- 1-Hop query. 
As well as implementing multithreaded reading by adding OpenMP directives to analyze concurrent performance on these graph analysis algorithms. 

When running BFS and 1-Hop tests we ran into bugs, segmentation faults for multithreaded ALEX queries.

For datasets, our graph results spreadsheet tracks runs across graphs including Amazon and Orkut, Live-Journal, Cit-Patents, Road, as-Skitter, StackOverflow, Enron, MathOverflow, fb-wall.

For KV microbenchmarks, we used datasets such as Longitudes, Longlat and varied thread counts up to 32 to study scaling behavior under point lookups and range-like access patterns (e.g., tuning MAX_LOOKUP_RANGE).

We also noticed a detail that ended up speeding up execution: many of our graph algorithm runs were done with lookup-stat updates disabled because we found the stat counters were in heavily used functions and had measurable overhead.


# What We Found
Many learned index writeups focus on whether they're faster than a B+ tree, but graph workloads force a second question: “is it competitive with graph-specific representations?”  We found this to be a much harsher comparison to evaluate for.

### ALEX vs the B+ tree
On graph insert time, ALEX beat the STX B+ tree baseline on the datasets we highlighted most often, which matched our expectation that using models to place data, + gapped leaf nodes can reduce expensive leaf shifts compared to denser B+ tree layouts.

For example, on the Amazon graph, our saved comparison lists an insert time of about 1.241s for ALEX versus 1.911s for STX.

On the Orkut graph, the gap was larger: about 73.41s for ALEX versus 205.07s for STX in the same insert-time comparison table.

On KV point lookups, our multithreaded Longitudes benchmark shows ALEX starting strong at 1 thread with 10,930,000 lookups/sec and reaching 52,090,000 lookups/sec at 32 threads.

STX, interestingly, starts much lower at 1 thread (1,544,163 lookups/sec) but catches up by 32 threads (48,543,689 lookups/sec), which revealed a trend we saw repeatedly: STX benefits more from multithreading than ALEX, exhibiting diminishing returns for ALEX’s advantage at high thread counts.

In this benchmark, ALEX's lookup advantage shrank as we added threads. STX gained more relative to its single-thread performance. We considered differences in memory access and shared-state overhead, but didn't isolate those effects, so the timing results alone don't tell us why the two scaled differently.

|Graph|ALEX|STX (B+ Tree)|VCSR|PCSR|BAL|ALEX vs STX|
|---|---|---|---|---|---|---|
|Amazon|1.24|1.91|0.55|1.47|0.75|**1.5× faster**|
|Orkut|73.4|205.1|42.2|125.8|40.9|**2.8× faster**|
|LiveJournal|27.3|60.4|13.7|39.1|18.7|**2.2× faster**|
|Cit-Patents|7.9|20.1|5.8|12.8|9.2|**2.5× faster**|
|Road|1.49|2.20|0.93|2.18|2.96|**1.5× faster**|
|StackOverflow|20.2|28.3|19.6|41.7|8.5|**1.4× faster**|

Table 1: Graph edge insertion time (s)

|Metric|Value|
|---|---|
|ALEX throughput / STX throughput at 1 thread|**7.08×**|
|ALEX throughput / STX throughput at 32 threads|**1.07×**|
|ALEX throughput increase (1→32 threads)|**4.77×**|
|STX throughput increase (1→32 threads)|**31.44×**|

Table 2: Ratios calculated from the Longitudes lookup rates quoted above

### ALEX vs graph-specific structures
When we zoom out to full graph algorithms, our own conclusion was very clear. We can format existing RMIs to fit graph workloads, but they are not yet as efficient as graph representations like CSR and VCSR.

This was made clear in our results: the saved benchmark comparison lists Amazon PageRank at about 1.5930s for ALEX versus 0.3720s for VCSR. STX was faster than both in that row, at about 0.3306s.

On SSSP for Amazon, the same comparison lists ALEX at about 0.1529s versus 0.0894s for VCSR. STX was faster here too, at about 0.0703s. The size of the gap depended on both the dataset and the algorithm.

Our results made sense in hindsight: predicting where an edge is stored is only part of the work in a graph algorithm. We also have to visit neighbors repeatedly. Our encoding keeps a source vertex's edges together in key order, but that doesn't give ALEX the same physical layout or traversal costs as a graph-specific representation.

Road and MathOverflow were recurring problem datasets, but calling both of them sparse didn't explain the result. They differ substantially in edges per node and in the shape of their encoded-key CDFs. We needed to separate the graph's connectivity, the choice of vertex IDs, and the index's memory layout before attributing the slowdown to any one of them.

| Graph        | ALEX  | STX  | VCSR   | ALEX time / VCSR time |
| ------------ | ----- | ---- | ------ | -------------------- |
| Amazon       | 1.59  | 0.33 | 0.372  | 4.3×                 |
| Orkut        | 74.79 | 15.33| 19.123 | 3.9×                 |
| LiveJournal  | 30.35 | 6.14 | 7.221  | 4.2×                 |
| Cit-Patents  | 15.71 | 2.85 | 4.730  | 3.3×                 |
| MathOverflow | 8.32  | 0.52 | 0.0119 | **~699×**            |

Table 3: PageRank execution times (s) from the saved benchmark comparison. Ratios use the unrounded values. The exported sheet does not record the thread count or iteration count, so I haven't assigned those settings to these rows.

### Uneven scaling across graphs
Road and MathOverflow stood out in the PageRank threading results. In our saved 1-to-32-thread comparison, ALEX's speedup was 0.69× on Road and 0.54× on MathOverflow: adding threads made those runs slower. STX scaled much better on those PageRank runs. That wasn't true of every algorithm, though; Road's SSSP run also slowed down under STX.

Memory locality is one possible explanation. More threads don't guarantee more useful work if accesses spend their time waiting on memory. Uneven key distributions could also affect ALEX's layout. But these timings don't establish a chain from sparse graph to repeated splits to deeper trees to cache interference. Even cache-miss counts on their own would not establish all those steps.

If I returned to this experiment, I'd compare tree depth, node occupancy and cache misses alongside the timings, and try remapping vertex IDs while preserving the same edges. That would help separate the effect of our encoding from the graph itself. The result we can state now is narrower: our ALEX adaptation scaled well on some graph workloads and poorly on others.

### Stat Counter overhead
One detail we found was that when implementing graph algorithms for structures that weren't designed for such data, it's important to track and minimize any overhead on iterator and lookup code paths. Even the smallest of operations per lookup can significantly decrease performance. 

During experimentation, we use conditions, like #ifdef, to temporarily disable increments like stats_.num_lookups++ from heavily used functions in order to minimize that overhead during measurement.

After disabling those lookup stat updates, we saw a significant improvement in performance for each algorithm, with BFS and PageRank benefiting the most. These updates don't impact normal KV performance but can stagnate graph performance which requires millions of iterations over edges each run. 

In hindsight, this makes sense, however it was a consideration we didn't take at the time of first experimentation. Constantly iterating on experiments, tracking performance, and reading code helped us figure out the appropriate implementation for graph analysis in a structure meant for key-value workloads. 

# What We Learned
Our main takeaway from the work is that learned indices weren’t yet as efficient as CSR/VCSR-style representations for the graph workloads we tested.

In the meantime we discovered many things in the process:
- ALEX's insertion advantage over STX carried over to several graph datasets, including about 1.5× on Amazon and 2.8× on Orkut. It wasn't universal: STX inserted faster on Enron, MathOverflow and fb-wall in the saved comparison.
- Faster insertion didn't translate into faster graph traversal. CSR-style layouts are designed around visiting a vertex's neighbors; encoding the same edges into a general-purpose index doesn't automatically preserve that efficiency.
- Adding threads helped some workloads and hurt others. Road and MathOverflow were especially poor PageRank cases for our ALEX implementation. The cause needs more investigation than an edges-per-node count or a global CDF can provide.


# Where This Goes
One direction our team discussed was trying other regression models, such as polynomial models, for key distributions that linear models fit poorly. I'd want to measure the prediction error first, though. A more expensive model would need to save enough search or update work to justify its own cost.

Another direction is concurrency as we expressed thread-safety issues around shared counters and lookup paths that could be further improved (instead of simply applying OpenMP locks and atomic operations).

A third direction is the encoding itself. Remapping vertex IDs and comparing the resulting layouts would be a useful experiment before changing the index. The graph would stay the same, while the numerical distribution ALEX sees could change substantially.

Finally, supporting persistent memory datasets is another direction we can go, along with secondary storage support and designing concurrency control tailored to ALEX’s layout.

What still interests me is whether a learned index designed around graph access patterns could retain the insertion benefits we saw without giving up efficient neighbor traversal. Our work doesn't establish that it would. It does give us a concrete tradeoff to investigate, and a reminder that a good result on key-value benchmarks doesn't automatically carry over to graph algorithms.

## Research poster

Poster from our research presentation, preserved as presented. Its insertion summary differs from the saved comparison used above; the archived files don't establish whether those runs used matching settings.

<iframe class="post-pdf-embed" src="writing/artifacts/Research%20Presentation%20-%20Ishaan%20Patel%20%26%20Dhananjay%20Raghu.pptx%20(1).pdf" title="Research presentation poster"></iframe>

<p class="post-pdf-link"><a href="writing/artifacts/Research%20Presentation%20-%20Ishaan%20Patel%20%26%20Dhananjay%20Raghu.pptx%20(1).pdf" target="_blank" rel="noopener">Open poster PDF in a new tab</a></p>
