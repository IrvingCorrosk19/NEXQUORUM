namespace Asambleas.Web.Controllers;

using Asambleas.Application.Security;
using Asambleas.Application.Voting;
using Asambleas.Contracts.Voting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/voting")]
public sealed class VotingController : ControllerBase
{
    private readonly VotingService _voting;

    public VotingController(VotingService voting)
    {
        _voting = voting;
    }

    [HttpPost("open")]
    [Authorize(Policy = Permissions.VoteOpen)]
    public Task<VotingSessionDto> Open(
        Guid assemblyId,
        [FromBody] OpenVotingSessionRequest request,
        CancellationToken cancellationToken) =>
        _voting.OpenSessionAsync(assemblyId, request, cancellationToken);

    [HttpPost("{votingSessionId:guid}/cast")]
    [Authorize(Policy = Permissions.VoteCast)]
    public Task<CastVoteResponse> Cast(
        Guid assemblyId,
        Guid votingSessionId,
        [FromBody] CastVoteRequest request,
        CancellationToken cancellationToken) =>
        _voting.CastVoteAsync(assemblyId, votingSessionId, request, cancellationToken);

    [HttpPost("{votingSessionId:guid}/close")]
    [Authorize(Policy = Permissions.VoteClose)]
    public Task<CloseVotingSessionResponse> Close(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken) =>
        _voting.CloseSessionAsync(assemblyId, votingSessionId, cancellationToken);

    [HttpGet("{votingSessionId:guid}/results")]
    [Authorize(Policy = Permissions.VoteResults)]
    public Task<VoteTallyDto> Results(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken) =>
        _voting.GetResultsAsync(assemblyId, votingSessionId, cancellationToken);

    [HttpGet("{votingSessionId:guid}/my-receipt")]
    [Authorize(Policy = Permissions.VoteCast)]
    public Task<VoteReceiptDto?> MyReceipt(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken) =>
        _voting.GetMyVoteReceiptAsync(assemblyId, votingSessionId, cancellationToken);

    [HttpGet("{votingSessionId:guid}/my-status")]
    [Authorize(Policy = Permissions.VoteCast)]
    public Task<MyVoteStatusDto> MyStatus(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken) =>
        _voting.GetMyVoteStatusAsync(assemblyId, votingSessionId, cancellationToken);

    [HttpGet("open")]
    [Authorize(Policy = Permissions.VoteView)]
    public Task<VotingSessionDto?> OpenSession(Guid assemblyId, CancellationToken cancellationToken) =>
        _voting.GetOpenSessionAsync(assemblyId, cancellationToken);
}
