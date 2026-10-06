# Records in the zone that belong to the domain rather than to a Kimply
# environment. Copied from GoDaddy so the nameserver switch loses nothing.
#
# GoDaddy's zone also held `_domainconnect`, which only exists to let GoDaddy
# configure third-party services, and the apex A records pointing at GoDaddy's
# forwarding servers. Neither is carried over.

resource "aws_route53_record" "dmarc" {
  zone_id = module.kimply.hosted_zone_id
  name    = "_dmarc.kimply.online"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;"]
}
